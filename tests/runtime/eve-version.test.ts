import { describe, expect, it } from "vitest";

// @ts-expect-error The verifier is intentionally dependency-free JavaScript.
import { verifyBaseline } from "../../scripts/verify-eve-baseline.mjs";

const validVersions = {
  declared: "0.27.1",
  locked: "0.27.1",
  installed: "0.27.1",
  nodeMajor: 24,
};

describe("Eve version baseline", () => {
  it("accepts the exact supported versions", () => {
    expect(verifyBaseline(validVersions)).toBe(true);
  });

  it.each([
    ["declared", { declared: "^0.27.1" }],
    ["locked", { locked: "0.27.2" }],
    ["installed", { installed: "0.27.2" }],
    ["Node major", { nodeMajor: 22 }],
  ])("rejects %s drift without exposing unrelated values", (_label, drift) => {
    expect(() => verifyBaseline({ ...validVersions, ...drift })).toThrow(
      /Eve drift requires reading the new bundled docs/,
    );
  });
});
