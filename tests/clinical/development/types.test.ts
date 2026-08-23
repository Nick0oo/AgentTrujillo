import { describe, expect, it } from "vitest";

import {
  attachmentReferenceSchema,
  caregiverMilestoneItemSchema,
  developmentConcernSchema,
  developmentContentProvenanceSchema,
  developmentDecisionProvenanceSchema,
  developmentFrameworkSchema,
  developmentGuidanceResultSchema,
  developmentObservationDraftSchema,
  developmentSourceProvenanceSchema,
} from "../../../src/clinical/development/types.ts";

const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);

const sourceProvenance = {
  sourceId: "synthetic-development-source",
  sourceUri: "https://example.invalid/development/source",
  sourceVersion: "2026.1",
  artifactSha256: DIGEST,
  license: "synthetic-test-license",
  retrievedAt: "2026-08-20T12:00:00.000Z",
};

const contentProvenance = {
  packageId: "development-co-caregiver",
  packageVersion: "1.0.0",
  algorithmVersion: "development-framework.v1",
  fixturesSha256: DIGEST,
  rightsSha256: OTHER_DIGEST,
  jurisdiction: "CO" as const,
  locale: "es-CO",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  translation: "original" as const,
  artifactSha256: DIGEST,
  approvalDigest: OTHER_DIGEST,
  sources: [sourceProvenance],
};

const attachment = {
  bucket: "clinical-attachments" as const,
  objectPath: "private/observation/photo-1.jpg",
  digest: DIGEST,
  mime: "image/jpeg" as const,
  size: 1024,
  state: "clean" as const,
};

const concern = {
  kind: "question_for_conversation" as const,
  text: "The caregiver wants to discuss this observation with a pediatrician.",
};

const milestone = {
  id: "reaches-for-toy",
  domain: "gross_motor" as const,
  title: "Reaches toward a toy",
  caregiverCopy: "You may notice the child reaching toward an interesting toy.",
  minAgeDays: 120,
  maxAgeDays: 240,
  provenance: contentProvenance,
};

describe("development domain contracts", () => {
  it("accepts a neutral caregiver observation fact and rejects unknown fields", () => {
    const draft = {
      text: "During floor play, the caregiver noticed reaching toward a toy.",
      date: "2026-08-20",
      domain: "gross_motor" as const,
      source: "caregiver" as const,
      milestoneId: milestone.id,
      concern,
      attachments: [attachment],
    };

    expect(developmentObservationDraftSchema.parse(draft)).toEqual(draft);
    expect(developmentObservationDraftSchema.safeParse({
      ...draft,
      childId: "child-from-model",
    }).success).toBe(false);
  });

  it("keeps the observation fact neutral and rejects inference, professional, EAD-3, and authority fields", () => {
    const draft = {
      text: "The caregiver noticed reaching toward a toy.",
      date: "2026-08-20",
      domain: "gross_motor" as const,
      source: "caregiver" as const,
    };

    for (const field of [
      "achieved",
      "score",
      "result",
      "developmentalAge",
      "delay",
      "autism",
      "diagnosis",
      "classification",
      "assessment",
      "inference",
      "childId",
      "careSpaceId",
      "guardianId",
      "countryOfCare",
      "roles",
      "permissions",
      "entitlements",
      "approvedBy",
    ]) {
      expect(developmentObservationDraftSchema.safeParse({ ...draft, [field]: "forbidden" }).success, field).toBe(false);
    }

    expect(developmentObservationDraftSchema.safeParse({ ...draft, source: "professional" }).success).toBe(false);
    expect(developmentObservationDraftSchema.safeParse({ ...draft, domain: "diagnosis" }).success).toBe(false);
    expect(developmentObservationDraftSchema.safeParse({
      ...draft,
      source: "guardian",
      milestoneId: null,
      concern: null,
      attachments: [],
    }).success).toBe(true);
  });

  it("accepts only a caregiver question as a concern and never a professional conclusion", () => {
    expect(developmentConcernSchema.parse(concern)).toEqual(concern);
    expect(developmentConcernSchema.safeParse({
      ...concern,
      conclusion: "developmental delay",
    }).success).toBe(false);
    expect(developmentConcernSchema.safeParse({
      kind: "professional_conclusion",
      text: "delay",
    }).success).toBe(false);
    expect(developmentConcernSchema.safeParse({
      ...concern,
      diagnosis: "autism",
    }).success).toBe(false);
  });

  it("requires governed provenance for caregiver milestone communication content", () => {
    expect(developmentSourceProvenanceSchema.parse(sourceProvenance)).toEqual(sourceProvenance);
    expect(developmentContentProvenanceSchema.parse(contentProvenance)).toEqual(contentProvenance);
    expect(caregiverMilestoneItemSchema.parse(milestone)).toEqual(milestone);

    expect(caregiverMilestoneItemSchema.safeParse({
      ...milestone,
      maxAgeDays: 119,
    }).success).toBe(false);
    expect(caregiverMilestoneItemSchema.safeParse({
      ...milestone,
      minAgeDays: -1,
    }).success).toBe(false);
    expect(developmentContentProvenanceSchema.safeParse({
      ...contentProvenance,
      effectiveFrom: "2026-12-31",
      effectiveUntil: "2026-01-01",
    }).success).toBe(false);
    expect(developmentContentProvenanceSchema.safeParse({
      ...contentProvenance,
      sources: [{ ...sourceProvenance, artifactSha256: "not-a-digest" }],
    }).success).toBe(false);
    expect(developmentContentProvenanceSchema.safeParse({
      ...contentProvenance,
      sources: [{ ...sourceProvenance, license: " " }],
    }).success).toBe(false);

    for (const field of ["professionalOnly", "score", "cutoff", "classification", "result", "itemPrompt"]) {
      expect(caregiverMilestoneItemSchema.safeParse({ ...milestone, [field]: "forbidden" }).success, field).toBe(false);
    }
    expect(caregiverMilestoneItemSchema.safeParse({ ...milestone, childId: "child-from-model" }).success).toBe(false);
  });

  it("distinguishes caregiver frameworks from opaque professional references", () => {
    const caregiverFramework = {
      kind: "caregiver_education" as const,
      audience: "caregiver" as const,
      id: "development-co-caregiver",
      version: "1.0.0",
      items: [milestone],
      provenance: contentProvenance,
      disclaimer: "Communication aid only; not a screening or diagnostic tool.",
    };
    const professionalReference = {
      kind: "professional_instrument_reference" as const,
      audience: "professional" as const,
      identifier: "instrument-reference-opaque",
      version: "3.0.0",
      rights: {
        license: "synthetic-professional-license",
        artifactSha256: DIGEST,
        rightsSha256: OTHER_DIGEST,
      },
      governance: {
        sourceId: "professional-source",
        sourceDigest: DIGEST,
        approvalDigest: OTHER_DIGEST,
      },
    };

    expect(developmentFrameworkSchema.parse(caregiverFramework)).toEqual(caregiverFramework);
    expect(developmentFrameworkSchema.parse(professionalReference)).toEqual(professionalReference);
    expect(developmentFrameworkSchema.safeParse({
      ...professionalReference,
      items: [milestone],
    }).success).toBe(false);
    for (const field of ["instrumentItems", "prompts", "responses", "score", "scoring", "cutoff", "classification", "result", "diagnosis"]) {
      expect(developmentFrameworkSchema.safeParse({ ...professionalReference, [field]: "forbidden" }).success, field).toBe(false);
    }
    for (const field of ["childId", "careSpaceId", "guardianId", "countryOfCare", "roles", "permissions", "entitlements", "approvedBy"]) {
      expect(developmentFrameworkSchema.safeParse({ ...caregiverFramework, [field]: "forbidden" }).success, field).toBe(false);
    }
    expect(developmentFrameworkSchema.safeParse({
      ...caregiverFramework,
      kind: "professional_screening",
      audience: "caregiver",
    }).success).toBe(false);
  });

  it("accepts only private immutable attachment evidence and never a URL or extracted truth", () => {
    expect(attachmentReferenceSchema.parse(attachment)).toEqual(attachment);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, publicUrl: "https://example.invalid/file" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, signedUrl: "https://example.invalid/file" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, extractedText: "clinical truth" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, bucket: "public" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, objectPath: "https://example.invalid/file" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, objectPath: "../other-child/file.jpg" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, objectPath: "private/file.jpg?public=true" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, digest: "not-a-digest" }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, size: 20971521 }).success).toBe(false);
    expect(attachmentReferenceSchema.safeParse({ ...attachment, state: "approved" }).success).toBe(false);
  });

  it("keeps emergency results terminal and rejects extras while preserving JSON round trips", () => {
    const emergency = {
      status: "emergency_only" as const,
      responseMode: "emergency_recommendation" as const,
      reasonCode: "urgent_preflight",
    };
    expect(developmentGuidanceResultSchema.parse(emergency)).toEqual(emergency);
    expect(developmentGuidanceResultSchema.safeParse({ ...emergency, phone: "123" }).success).toBe(false);
    expect(developmentGuidanceResultSchema.safeParse({ ...emergency, url: "https://example.invalid" }).success).toBe(false);
    expect(developmentGuidanceResultSchema.safeParse({ ...emergency, action: "call" }).success).toBe(false);
    expect(developmentGuidanceResultSchema.safeParse({
      ...emergency,
      responseMode: "pediatrician_recommendation",
    }).success).toBe(false);

    const decisionProvenance = {
      packageId: contentProvenance.packageId,
      packageVersion: contentProvenance.packageVersion,
      artifactSha256: DIGEST,
      sourceDigests: [DIGEST],
      algorithmId: "development-framework",
      algorithmVersion: "1.0.0",
      inputDigest: DIGEST,
      decisionDigest: OTHER_DIGEST,
    };
    const educational = {
      status: "educational_guidance" as const,
      milestones: [milestone],
      disclaimer: "Communication aid only; not a screening or diagnostic tool.",
      provenance: decisionProvenance,
    };
    expect(developmentDecisionProvenanceSchema.parse(decisionProvenance)).toEqual(decisionProvenance);
    expect(developmentGuidanceResultSchema.parse(educational)).toEqual(educational);
    expect(developmentGuidanceResultSchema.safeParse({
      ...educational,
      diagnosis: "developmental delay",
    }).success).toBe(false);

    const roundTrips = [
      draftForRoundTrip(),
      concern,
      milestone,
      attachment,
      emergency,
    ];
    expect(JSON.parse(JSON.stringify(roundTrips[0]))).toEqual(roundTrips[0]);
    expect(developmentObservationDraftSchema.parse(JSON.parse(JSON.stringify(roundTrips[0])))).toEqual(roundTrips[0]);
    expect(developmentConcernSchema.parse(JSON.parse(JSON.stringify(roundTrips[1])))).toEqual(roundTrips[1]);
    expect(caregiverMilestoneItemSchema.parse(JSON.parse(JSON.stringify(roundTrips[2])))).toEqual(roundTrips[2]);
    expect(attachmentReferenceSchema.parse(JSON.parse(JSON.stringify(roundTrips[3])))).toEqual(roundTrips[3]);
    expect(developmentGuidanceResultSchema.parse(JSON.parse(JSON.stringify(roundTrips[4])))).toEqual(roundTrips[4]);
    expect(developmentGuidanceResultSchema.parse(JSON.parse(JSON.stringify(educational)))).toEqual(educational);
  });
});

function draftForRoundTrip() {
  return {
    text: "The caregiver noticed reaching toward a toy.",
    date: "2026-08-20",
    domain: "gross_motor" as const,
    source: "caregiver" as const,
    milestoneId: milestone.id,
    concern,
    attachments: [attachment],
  };
}
