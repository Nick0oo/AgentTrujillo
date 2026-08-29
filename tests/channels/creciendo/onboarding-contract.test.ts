import { describe, expect, test } from "vitest";

import { ONBOARDING_REQUEST_SCHEMA, ONBOARDING_RESPONSE_SCHEMA } from "../../../src/channels/creciendo/onboarding-contract";

const VALID = {
  contractVersion: "onboarding.v1",
  idempotencyKey: "onboarding-test-1",
  careSpace: { name: "Familia de prueba" },
  child: {
    givenNames: "Infante de prueba",
    birthDate: "2024-04-12",
    referenceSex: "female",
    countryOfCare: "CO",
    timezone: "America/Bogota",
    isPremature: false,
    gestationalAgeWeeks: null,
    allergies: [],
  },
  guardianRelationship: "mother",
  privacyConsentAccepted: true,
} as const;

describe("Creciendo onboarding contract", () => {
  test("accepts the closed request and rejects authority fields", () => {
    expect(ONBOARDING_REQUEST_SCHEMA.safeParse(VALID).success).toBe(true);
    expect(ONBOARDING_REQUEST_SCHEMA.safeParse({ ...VALID, guardianId: "forged" }).success).toBe(false);
  });

  test("enforces prematurity semantics", () => {
    expect(ONBOARDING_REQUEST_SCHEMA.safeParse({ ...VALID, child: { ...VALID.child, isPremature: true } }).success).toBe(false);
    expect(ONBOARDING_REQUEST_SCHEMA.safeParse({ ...VALID, child: { ...VALID.child, isPremature: true, gestationalAgeWeeks: 36 } }).success).toBe(true);
    expect(ONBOARDING_REQUEST_SCHEMA.safeParse({ ...VALID, child: { ...VALID.child, gestationalAgeWeeks: 36 } }).success).toBe(false);
  });

  test("validates the bounded success projection", () => {
    expect(ONBOARDING_RESPONSE_SCHEMA.safeParse({
      contractVersion: "onboarding.v1",
      status: "created",
      careSpaceId: "00000000-0000-4000-8000-000000000001",
      childId: "00000000-0000-4000-8000-000000000002",
      resourceVersion: 1,
    }).success).toBe(true);
  });
});
