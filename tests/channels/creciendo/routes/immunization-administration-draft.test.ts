import { describe, expect, test, vi } from "vitest";

import { handleImmunizationAdministrationDraft, type ImmunizationAdministrationDraftRouteDependencies } from "../../../../src/channels/creciendo/routes/immunization-administration-draft.ts";

const guardianId = "10000000-0000-4000-8000-000000000001";
const auth = {
  requestId: "request-draft-1",
  actorKey: "guardian:1",
  rateClass: "command" as const,
  profile: { locale: "es-CO" as const, timeZone: "America/Bogota", versionSha256: "a".repeat(64) },
  guardian: { userId: guardianId, bearerToken: "token" } as never,
};
const scope = {
  actorUserId: guardianId,
  careSpaceId: "20000000-0000-4000-8000-000000000001",
  childId: "30000000-0000-4000-8000-000000000001",
  permissions: ["record"],
  countryOfCare: "CO" as const,
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-09-02T12:00:00.000Z"),
  expiresAt: new Date("2026-09-02T12:05:00.000Z"),
};
const key = `draft_vaccine_administration:${"a".repeat(64)}`;

function dependencies(command: ImmunizationAdministrationDraftRouteDependencies["command"]): ImmunizationAdministrationDraftRouteDependencies {
  return {
    tokens: { verify: vi.fn(async () => ({ childId: scope.childId, careSpaceId: scope.careSpaceId, authorizationVersion: scope.authorizationVersion })) } as never,
    authorizeChild: { authorize: vi.fn(async () => scope) } as never,
    command,
    now: () => new Date("2026-09-02T12:01:00.000Z"),
  };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://agent.test/creciendo/v1/immunization/administration-drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key, "x-child-context": "child-token", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /creciendo/v1/immunization/administration-drafts", () => {
  test("returns a server-issued draft id after authorization", async () => {
    const command = { execute: vi.fn(async () => ({
      response: {
        version: "creciendo.immunization.draft.v1" as const,
        requestId: auth.requestId,
        outcome: "created" as const,
        draftId: "draft-1",
        expiresAt: "2026-09-02T12:06:00.000Z",
        confirmationRequired: true as const,
      },
    })) };
    const response = await handleImmunizationAdministrationDraft(request({ version: "creciendo.immunization.draft.v1", administeredOn: "2026-08-01", productIdentifier: "BCG" }), auth, dependencies(command));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ draftId: "draft-1", confirmationRequired: true });
    expect(command.execute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: key, scope }));
  });

  test("rejects malformed or missing idempotency input before command", async () => {
    const command = { execute: vi.fn() };
    const response = await handleImmunizationAdministrationDraft(request({ version: "creciendo.immunization.draft.v1", administeredOn: "2026-08-01" }, { "idempotency-key": "bad" }), auth, dependencies(command));
    expect(response.status).toBe(400);
    expect(command.execute).not.toHaveBeenCalled();
  });
});
