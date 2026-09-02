import { describe, expect, test } from "vitest";

import { ADD_CHILD_REQUEST_SCHEMA, ADD_CHILD_RESPONSE_SCHEMA } from "../../../src/channels/creciendo/add-child-contract";

const valid = {
  contractVersion: "add-child.v1",
  idempotencyKey: "sibling-1",
  careSpaceId: "00000000-0000-4000-8000-000000000001",
  child: {
    givenNames: "Ana", familyNames: null, preferredName: null, birthDate: "2024-04-12",
    timeOfBirth: null, birthTimeZone: null, referenceSex: "female", countryOfCare: "CO",
    timezone: "America/Bogota", isPremature: false, gestationalAgeWeeks: null,
    gestationalAgeDays: null, birthWeightGrams: null, allergies: [],
  },
  privacyConsentAccepted: true,
};

describe("add child contract", () => {
  test("requires the existing care-space scope and care timezone", () => {
    expect(ADD_CHILD_REQUEST_SCHEMA.safeParse(valid).success).toBe(true);
    expect(ADD_CHILD_REQUEST_SCHEMA.safeParse({ ...valid, careSpaceId: "" }).success).toBe(false);
    expect(ADD_CHILD_REQUEST_SCHEMA.safeParse({ ...valid, child: { ...valid.child, timezone: "" } }).success).toBe(false);
  });

  test("accepts only the created response projection", () => {
    expect(ADD_CHILD_RESPONSE_SCHEMA.parse({
      contractVersion: "add-child.v1", status: "created", careSpaceId: valid.careSpaceId,
      childId: "00000000-0000-4000-8000-000000000002", resourceVersion: 1,
    })).toMatchObject({ status: "created" });
  });
});
