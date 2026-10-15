import { describe, expect, it, vi } from "vitest";

import { handleChildDirectory, type ChildDirectoryResolver } from "../../../../src/channels/creciendo/routes/child-directory";

const auth = { requestId: "directory-test", guardian: { userId: "00000000-0000-4000-8000-000000000001" } } as any;

describe("GET /creciendo/v1/children", () => {
  it("groups only backend-authorized children by care space", async () => {
    const resolver: ChildDirectoryResolver = {
      resolve: vi.fn(async () => [
        {
          careSpaceId: "00000000-0000-4000-8000-000000000010",
          careSpaceName: "Casa",
          countryOfCare: "CO" as const,
          timeZone: "America/Bogota",
          childId: "00000000-0000-4000-8000-000000000011",
          displayName: "A",
          birthDate: "2020-01-02",
        },
      ]),
    };
    const response = await handleChildDirectory(new Request("https://agent.test/creciendo/v1/children"), auth, { resolver });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: "creciendo.directory.v1",
      requestId: "directory-test",
      careSpaces: [{
        careSpaceId: "00000000-0000-4000-8000-000000000010",
        name: "Casa",
        countryOfCare: "CO",
        timeZone: "America/Bogota",
        children: [{
          childId: "00000000-0000-4000-8000-000000000011",
          displayName: "A",
          birthDate: "2020-01-02",
          countryOfCare: "CO",
          timeZone: "America/Bogota",
        }],
      }],
    });
  });

  it("fails closed when the resolver cannot prove a safe result", async () => {
    const resolver: ChildDirectoryResolver = { resolve: vi.fn(async () => null) };
    const response = await handleChildDirectory(new Request("https://agent.test/creciendo/v1/children"), auth, { resolver });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("PERSISTENCE_UNAVAILABLE");
  });
});
