import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../agent/lib/access/authorized-child-scope.ts";
import type { FoodReactionQuerySuccess } from "../../src/application/nutrition/food-reaction-query.ts";
import type { NutritionProfileQuerySuccess } from "../../src/application/nutrition/nutrition-profile-query.ts";
import {
  evaluateDevelopmentAttachment,
  type DevelopmentAttachmentEvidence,
  type DevelopmentAttachmentPolicy,
} from "../../src/clinical/development/attachment-policy.ts";
import {
  enforceProfessionalFrameworkBoundary,
  type ProfessionalFrameworkBoundaryContext,
  type ProfessionalFrameworkBoundaryRequest,
} from "../../src/clinical/development/ead3-boundary.ts";
import {
  validateDevelopmentObservation,
  type DevelopmentObservationValidationContext,
} from "../../src/clinical/development/observation-validation.ts";
import type { DevelopmentFramework } from "../../src/clinical/development/types.ts";
import type { Sha256Hex } from "../../src/clinical/governance/source-types.ts";
import {
  applyNutritionAbstention,
  type NutritionAbstentionContext,
} from "../../src/clinical/nutrition/abstention.ts";
import type { NutritionCompositionResult } from "../../src/clinical/nutrition/composer.ts";
import type { NutritionContentResolution } from "../../src/clinical/nutrition/content-loader.ts";
import {
  evaluateNutritionEligibility,
  type NutritionEligibilityContext,
  type NutritionEligibilityPolicy,
} from "../../src/clinical/nutrition/eligibility.ts";
import {
  computeTextureSafetyArtifactSha256,
  evaluateTextureSafety,
  type TextureSafetyContext,
  type TextureSafetyRequest,
  type TextureSafetyRule,
  type TextureSafetyRulePack,
  type TextureSafetyResult,
} from "../../src/clinical/nutrition/texture-policy.ts";
import type { FoodRestriction, NutritionAgeEvidence } from "../../src/clinical/nutrition/types.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const CUTOFF = NOW.toISOString();
const CONVEYED_APPROVAL_RECORD = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as const;
const APPROVAL_RECORD = CONVEYED_APPROVAL_RECORD as Sha256Hex;
const DIGEST_A = "a".repeat(64) as Sha256Hex;
const DIGEST_B = "b".repeat(64) as Sha256Hex;
const DIGEST_C = "c".repeat(64) as Sha256Hex;
const DIGEST_D = "d".repeat(64) as Sha256Hex;
const ZERO = "0".repeat(64) as Sha256Hex;
const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000004";

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function scope(overrides: Partial<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  permissions: readonly string[];
  countryOfCare: string;
  timezone: string;
}> = {}): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR_ID,
    careSpaceId: CARE_SPACE_ID,
    childId: CHILD_ID,
    permissions: ["manage_documents", "read", "record"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:1:a:1",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: new Date("2026-08-23T12:04:00.000Z"),
    ...overrides,
  });
}

const factProvenance = {
  provenanceType: "system" as const,
  sourceId: "synthetic-age-evidence",
  sourceDigest: DIGEST_A,
  observedAt: CUTOFF,
};

const age: NutritionAgeEvidence = {
  ageDays: 200,
  basis: "chronological",
  referenceInstant: CUTOFF,
  timeZone: "America/Bogota",
  algorithmVersion: "chronological-age.v1",
  provenance: factProvenance,
};

function profileEnvelope(): NutritionProfileQuerySuccess {
  const profile = {
    feedingApproach: "traditional_complementary" as const,
    textureStage: "soft_lumpy" as const,
    exclusions: [] as readonly string[],
    source: {
      sourceId: "synthetic-profile",
      createdAt: "2026-08-23T11:50:00.000Z",
      updatedAt: "2026-08-23T11:50:00.000Z",
    },
  };
  const completeness = {
    age: "complete" as const,
    feedingApproach: "complete" as const,
    textureStage: "complete" as const,
    exclusions: "complete" as const,
    professionalPlan: "unknown" as const,
  };
  return {
    ok: true,
    status: "available",
    age,
    profile,
    professionalPlan: "unknown",
    completeness,
    digest: digest({
      algorithmVersion: "nutrition-profile-query.v1",
      cutoff: CUTOFF,
      age,
      profile,
      professionalPlan: "unknown",
      completeness,
    }),
  };
}

function reactionEnvelope(): FoodReactionQuerySuccess {
  return {
    ok: true,
    status: "available",
    reactions: [],
    digest: digest({ algorithmVersion: "food-reaction-query.v1", cutoff: CUTOFF, reactions: [] }),
  };
}

function eligibilityContext(overrides: Partial<NutritionEligibilityContext> = {}): NutritionEligibilityContext {
  const profile = profileEnvelope();
  return {
    countryOfCare: "CO",
    cutoff: CUTOFF,
    age,
    readiness: { status: "ready", provenance: factProvenance },
    feedingApproach: "traditional_complementary",
    textureStage: "soft_lumpy",
    restrictions: [],
    professionalPlan: "unknown",
    profile,
    reactions: reactionEnvelope(),
    concerns: { swallowing: "none", poorGrowthOrCondition: "none", specialDiet: "none" },
    ...overrides,
  };
}

const nutritionProvenance = {
  packageId: "nutrition-co-eval",
  packageVersion: "1.0.0",
  algorithmVersion: "nutrition-eligibility.v1",
  fixturesSha256: DIGEST_B,
  rightsSha256: DIGEST_C,
  jurisdiction: "CO" as const,
  locale: "es-CO",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  translation: "original" as const,
  artifactSha256: DIGEST_D,
  approvalDigest: DIGEST_A,
  sources: [{
    sourceId: "synthetic-nutrition-source",
    sourceUri: "https://www.who.int/synthetic/nutrition",
    sourceVersion: "2026.1",
    artifactSha256: DIGEST_B,
    license: "synthetic-test-license",
    retrievedAt: "2026-08-20T12:00:00.000Z",
  }],
};

const eligibilityPolicy: NutritionEligibilityPolicy = {
  country: "CO",
  contentId: "recipe-grape",
  contentType: "recipe",
  tags: ["complementary_feeding", "grape"],
  ingredientCodes: ["grape"],
  minAgeDays: 180,
  maxAgeDays: 730,
  readiness: "required",
  texture: "soft_lumpy",
  supervision: "required",
  provenance: nutritionProvenance,
  governance: {
    packageId: nutritionProvenance.packageId,
    packageVersion: nutritionProvenance.packageVersion,
    country: "CO",
    sourceDigests: [DIGEST_B],
    artifactSha256: nutritionProvenance.artifactSha256,
    algorithmId: "nutrition-eligibility",
    algorithmVersion: "nutrition-eligibility.v1",
    fixturesSha256: nutritionProvenance.fixturesSha256,
    rightsSha256: nutritionProvenance.rightsSha256,
    approvalDigest: nutritionProvenance.approvalDigest,
    approvalRecordDigest: APPROVAL_RECORD,
    approvalProvenance: "product_owner_conveyed",
    releaseStatus: "active",
  },
};

function reactionRestriction(): FoodRestriction {
  return {
    kind: "reaction",
    foodCode: "grape",
    foodLabel: "Synthetic grape",
    state: "declared",
    severity: "unknown",
    supersedesId: null,
    provenance: {
      provenanceType: "guardian",
      sourceId: "synthetic-restriction",
      sourceDigest: DIGEST_A,
      observedAt: CUTOFF,
    },
  };
}

function composedRecipe(ingredientCode: string): Extract<NutritionCompositionResult, { status: "composed" }> {
  const guidance = [
    ["allowed-form", "Use only the approved preparation form."],
    ["transform-form", "Use the approved preparation transformation and supervise the meal."],
    ["excluded-form", "Do not offer this preparation form."],
    ["review-form", "Pause generic guidance and discuss preparation with a pediatrician."],
  ] as const;
  const recipe = {
    id: `recipe-${ingredientCode}`,
    title: `Synthetic ${ingredientCode} meal`,
    ingredientCodes: [ingredientCode],
    preparationSteps: ["Follow the approved preparation block."],
    texture: "soft_lumpy" as const,
    supervision: "required" as const,
    guidance: guidance.map(([id, text]) => ({ id, title: id, text, tags: [id] })),
    allowedSubstitutions: [],
    rationaleCodes: ["age_and_readiness_match"],
    citations: [{
      sourceId: "synthetic-nutrition-source",
      sourceUri: "https://www.who.int/synthetic/nutrition",
      sourceVersion: "2026.1",
      artifactSha256: DIGEST_B,
      license: "synthetic-test-license",
    }],
  };
  const approvedContentIds = [recipe.id, ...recipe.guidance.map((block) => block.id)].sort();
  const provenance = {
    packageId: "nutrition-co-eval",
    packageVersion: "1.0.0",
    artifactSha256: DIGEST_D,
    sourceDigests: [DIGEST_B],
    algorithmId: "nutrition-composer" as const,
    algorithmVersion: "nutrition-composer.v1" as const,
    contentResolutionDigest: digest({ content: true }),
    eligibilityDecisionDigests: [digest({ eligible: true })],
    seedDigest: digest("seed"),
    inputDigest: digest({ input: true }),
  };
  return {
    status: "composed",
    approvedContentIds,
    recipes: [recipe],
    exclusions: [],
    provenance: {
      ...provenance,
      compositionDigest: digest({ approvedContentIds, recipes: [recipe], exclusions: [], provenance }),
    },
  };
}

function textureRule(
  ingredientCode: string,
  formCode: string,
  disposition: TextureSafetyRule["disposition"],
): TextureSafetyRule {
  return {
    id: `${ingredientCode}-${formCode}`,
    ingredientCode,
    formCode,
    shapeCode: formCode === "whole_round" ? "round" : "not_applicable",
    sizeCode: formCode === "whole_round" || formCode === "whole_nut" ? "whole" : "not_applicable",
    textureCode: formCode === "whole_nut" ? "hard" : formCode === "whole_round" ? "firm" : "soft",
    disposition,
    reasonCode: disposition === "allowed" ? "approved_form" : disposition === "transform_required" ? "risky_form_transform" : "risky_form_excluded",
    approvedBlockId: disposition === "allowed" ? "allowed-form" : disposition === "transform_required" ? "transform-form" : "excluded-form",
    transformation: disposition === "transform_required" ? {
      formCode: "quarter_lengthwise",
      shapeCode: "not_applicable",
      sizeCode: "bite_sized_soft",
      textureCode: "soft",
    } : null,
  };
}

function texturePack(composition: Extract<NutritionCompositionResult, { status: "composed" }>, rules: readonly TextureSafetyRule[]): TextureSafetyRulePack {
  const input = {
    packageId: "nutrition-co-texture-eval",
    packageVersion: "1.0.0",
    country: "CO" as const,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    algorithmVersion: "texture-safety.v1" as const,
    contentArtifactSha256: composition.provenance.artifactSha256,
    fixturesSha256: DIGEST_C,
    rightsSha256: DIGEST_D,
    sources: [{
      sourceId: "synthetic-nutrition-source",
      authority: "WHO" as const,
      jurisdiction: "GLOBAL" as const,
      sourceUri: "https://www.who.int/synthetic/nutrition",
      artifactSha256: DIGEST_B,
      license: "synthetic-test-license",
    }],
    rules,
    fallbackBlockIds: { reviewRequired: "review-form", readinessNotReady: "review-form", swallowingConcern: "review-form" },
    status: "released" as const,
    current: true,
    revoked: false,
    approval: {
      status: "approved" as const,
      current: true,
      revoked: false,
      digest: DIGEST_A,
      recordDigest: APPROVAL_RECORD,
      approvedArtifactSha256: ZERO,
    },
  };
  const artifactSha256 = computeTextureSafetyArtifactSha256({ ...input, artifactSha256: ZERO });
  return { ...input, artifactSha256, approval: { ...input.approval, approvedArtifactSha256: artifactSha256 } };
}

function textureContext(
  ingredientCode: string,
  rule: TextureSafetyRule,
  overrides: Partial<TextureSafetyContext> = {},
): TextureSafetyContext {
  const composition = composedRecipe(ingredientCode);
  return {
    cutoff: NOW,
    revalidatedScope: scope(),
    composition,
    feedingApproach: "traditional_complementary",
    readiness: "ready",
    swallowingAbility: "adequate",
    rulePack: texturePack(composition, [rule]),
    ...overrides,
  };
}

function presentation(ingredientCode: string, formCode: string): TextureSafetyRequest {
  return {
    recipeId: `recipe-${ingredientCode}`,
    presentations: [{
      ingredientCode,
      formCode,
      shapeCode: formCode === "whole_round" ? "round" : "not_applicable",
      sizeCode: formCode === "whole_round" || formCode === "whole_nut" ? "whole" : "not_applicable",
      textureCode: formCode === "whole_nut" ? "hard" : formCode === "whole_round" ? "firm" : formCode === "unknown" ? "unknown" : "soft",
    }],
  };
}

function contentEvidence(composition: Extract<NutritionCompositionResult, { status: "composed" }>): NutritionContentResolution {
  return {
    ok: true,
    value: {
      manifest: { jurisdiction: "CO", locale: "es-CO" },
      packageId: composition.provenance.packageId,
      packageVersion: composition.provenance.packageVersion,
      artifactSha256: composition.provenance.artifactSha256,
      sourceDigests: composition.provenance.sourceDigests,
      rightsDigest: DIGEST_C,
      licenseDigest: DIGEST_D,
      approvalDigest: DIGEST_A,
      approvalRecordDigest: APPROVAL_RECORD,
      digest: composition.provenance.contentResolutionDigest,
    },
  } as NutritionContentResolution;
}

function abstentionContext(
  composition: Extract<NutritionCompositionResult, { status: "composed" }>,
  texture: TextureSafetyResult,
  overrides: Partial<NutritionAbstentionContext> = {},
): NutritionAbstentionContext {
  return {
    cutoff: NOW,
    revalidatedScope: scope(),
    safetyDecision: { decision: "not_urgent", responseMode: "continue" },
    content: contentEvidence(composition),
    composition,
    texture,
    signals: {
      age: "in_scope",
      reaction: "none",
      swallowing: "none",
      growthOrCondition: "none",
      specialDiet: "none",
      professionalPlan: "none",
      facts: "complete",
    },
    ...overrides,
  };
}

function caregiverFramework(): Extract<DevelopmentFramework, { audience: "caregiver" }> {
  return {
    kind: "caregiver_observation",
    audience: "caregiver",
    id: "development-co-caregiver",
    version: "1.0.0",
    items: [],
    provenance: {
      packageId: "development-co-caregiver",
      packageVersion: "1.0.0",
      algorithmVersion: "development-framework.v1",
      fixturesSha256: DIGEST_A,
      rightsSha256: DIGEST_B,
      jurisdiction: "CO",
      locale: "es-CO",
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
      translation: "original",
      artifactSha256: DIGEST_A,
      approvalDigest: DIGEST_B,
      sources: [{
        sourceId: "synthetic-development-source",
        sourceUri: "https://example.invalid/development/source",
        sourceVersion: "2026.1",
        artifactSha256: DIGEST_A,
        license: "synthetic-test-license",
        retrievedAt: "2026-08-20T12:00:00.000Z",
      }],
    },
    disclaimer: "Communication aid only; not a developmental standard, screening tool, diagnostic tool, or proof of normality.",
  };
}

function eadRequest(overrides: Partial<ProfessionalFrameworkBoundaryRequest> = {}): ProfessionalFrameworkBoundaryRequest {
  return {
    routeId: "development_milestones",
    toolId: null,
    capability: "caregiver_education",
    identifiers: ["development-co-caregiver"],
    requestedFields: ["id", "domain", "title", "caregiverCopy"],
    tags: ["caregiver"],
    artifactIds: [],
    attachmentLabels: [],
    contentFragments: ["Show caregiver conversation milestones."],
    ...overrides,
  };
}

function eadContext(overrides: Partial<ProfessionalFrameworkBoundaryContext> = {}): ProfessionalFrameworkBoundaryContext {
  return {
    cutoff: NOW,
    revalidatedScope: scope(),
    surface: "consumer",
    framework: caregiverFramework(),
    professionalArtifactIds: ["professional-artifact-opaque-01"],
    entitlements: [],
    ...overrides,
  };
}

const milestone = {
  id: "reaches-for-toy",
  domain: "gross_motor" as const,
  title: "Reaches toward a toy",
  caregiverCopy: "You may notice the child reaching toward an interesting toy.",
  minAgeDays: 120,
  maxAgeDays: 240,
  provenance: caregiverFramework().provenance,
};

function observationContext(): DevelopmentObservationValidationContext {
  return {
    cutoff: CUTOFF,
    timeZone: "America/Bogota",
    ageEvidence: {
      ageDays: 200,
      basis: "chronological",
      referenceInstant: CUTOFF,
      timeZone: "America/Bogota",
      algorithmVersion: "chronological-age.v1",
      provenance: factProvenance,
    },
    milestoneEvidence: {
      audience: "caregiver",
      status: "released",
      current: true,
      revoked: false,
      approvalDigest: milestone.provenance.approvalDigest,
      approvalRecordDigest: CONVEYED_APPROVAL_RECORD,
      frameworkId: milestone.provenance.packageId,
      frameworkVersion: milestone.provenance.packageVersion,
      frameworkDigest: milestone.provenance.artifactSha256,
      jurisdiction: "CO",
      locale: "es-CO",
      effectiveFrom: milestone.provenance.effectiveFrom,
      effectiveUntil: milestone.provenance.effectiveUntil,
      itemDigest: digest(milestone),
      item: milestone,
    },
    attachmentProofs: [],
  };
}

function observation(text: string, milestoneId: string | null = milestone.id) {
  return {
    text,
    date: "2026-08-23",
    domain: "gross_motor" as const,
    source: "guardian" as const,
    milestoneId,
    concern: null,
    attachments: [],
  };
}

function attachmentPolicy(): DevelopmentAttachmentPolicy {
  return {
    policyId: "development-attachment-policy",
    policyVersion: "1.0.0",
    artifactSha256: DIGEST_A,
    current: true,
    revoked: false,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    maximumSizeBytes: 20_971_520,
    allowedMediaTypes: ["application/pdf", "image/jpeg", "image/png"],
    allowedRetentionClasses: ["guardian_controlled"],
  };
}

function attachmentEvidence(overrides: Partial<DevelopmentAttachmentEvidence> = {}): DevelopmentAttachmentEvidence {
  const objectPath = `${CARE_SPACE_ID}/${CHILD_ID}/${DOCUMENT_ID}/${"e".repeat(32)}`;
  return {
    documentId: DOCUMENT_ID,
    careSpaceId: CARE_SPACE_ID,
    childId: CHILD_ID,
    uploadedBy: ACTOR_ID,
    purpose: "development_observation",
    storage: { bucket: "clinical-attachments", objectPath, visibility: "private", permanentUrl: null },
    content: {
      declaredMediaType: "image/png",
      detectedMediaType: "image/png",
      expectedSizeBytes: 100,
      actualSizeBytes: 100,
      expectedSha256: DIGEST_A,
      actualSha256: DIGEST_A,
    },
    ticket: {
      audience: "private_upload",
      purpose: "development_observation",
      state: "consumed",
      issuedAt: "2026-08-23T11:59:00.000Z",
      expiresAt: "2026-08-23T12:01:00.000Z",
      consumedAt: "2026-08-23T11:59:30.000Z",
      upsert: false,
      nonceSha256: DIGEST_B,
      scopeProofSha256: DIGEST_A,
    },
    scan: {
      state: "clean",
      engineId: "synthetic-malware-scanner",
      engineVersion: "1.0.0",
      signatureVersion: "2026.08.23",
      scannedAt: "2026-08-23T11:59:45.000Z",
      reportSha256: DIGEST_B,
    },
    processingState: "clean",
    consent: {
      consentType: "clinical_attachment",
      status: "granted",
      version: "1.0.0",
      decisionAt: "2026-08-23T11:58:00.000Z",
      expiresAt: null,
      revokedAt: null,
      recordSha256: DIGEST_A,
    },
    retention: {
      class: "guardian_controlled",
      retainUntil: "2027-08-23",
      policyId: "document-retention",
      policyVersion: "1.0.0",
      policySha256: DIGEST_B,
      current: true,
      revoked: false,
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
    },
    lifecycle: { state: "active", deletedAt: null },
    ...overrides,
  };
}

type EvalCase = Readonly<{
  id: string;
  boundary: "nutrition" | "development" | "isolation";
  country: "CO" | "US";
  ageDays: number;
  critical: boolean;
  sourceIds: readonly string[];
  packageId: string;
  approvalDigest: Sha256Hex;
  run: () => Readonly<{ passed: boolean; actual: string; visible?: unknown }>;
}>;

type EvalCaseResult = Omit<EvalCase, "run"> & Readonly<{ passed: boolean; actual: string; leakage: boolean }>;

export type NutritionDevelopmentEvalResult = Readonly<{
  schemaVersion: "nutrition-development-eval-v1";
  provider: "none";
  reviewer: "root_engineering_with_conveyed_clinical_approval";
  passed: number;
  failed: number;
  criticalDiscrepancies: number;
  leakageFindings: number;
  isolationFailures: number;
  provenanceGaps: number;
  crossCountryMixes: number;
  caseCount: number;
  caseDigest: Sha256Hex;
  cases: readonly Readonly<{ id: string; boundary: EvalCase["boundary"]; passed: boolean; actual: string }>[];
}>;

function containsLeakage(value: unknown): boolean {
  return /ead\s*[-–—]?\s*3.{0,80}(?:item|score|cutoff|classification)|diagnos(?:is|e|ed)|prescri|guaranteed safe|safe to give|phone|call|contact|book|appointment|map|location|notify|dr\.?\s*trujillo/iu.test(JSON.stringify(value));
}

function cases(): readonly EvalCase[] {
  const grapeTransformRule = textureRule("grape", "whole_round", "transform_required");
  const grapeContext = textureContext("grape", grapeTransformRule);
  const grapeRequest = presentation("grape", "whole_round");
  const grapeTexture = evaluateTextureSafety(scope(), grapeRequest, grapeContext);
  const grapeComposition = grapeContext.composition as Extract<NutritionCompositionResult, { status: "composed" }>;
  const neutralDraft = observation("During floor play, the caregiver noticed reaching toward a toy.");
  const firstObservation = validateDevelopmentObservation(neutralDraft, observationContext());
  const sourceIds = ["synthetic-nutrition-source"] as const;
  const developmentSources = ["synthetic-development-source"] as const;

  return [
    {
      id: "nutrition-exact-age-awaits-plan-evidence",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = evaluateNutritionEligibility(eligibilityContext(), eligibilityPolicy);
        return { passed: result.status === "review_required" && result.reasonCodes.includes("professional_plan_unknown"), actual: result.status };
      },
    },
    {
      id: "nutrition-reaction-excluded",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = evaluateNutritionEligibility(eligibilityContext({ restrictions: [reactionRestriction()] }), eligibilityPolicy);
        return { passed: result.status === "excluded" && result.reasonCodes.includes("known_reaction"), actual: result.status };
      },
    },
    {
      id: "nutrition-readiness-unknown",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = evaluateNutritionEligibility(eligibilityContext({ readiness: { status: "unknown", provenance: factProvenance } }), eligibilityPolicy);
        return { passed: result.status === "review_required", actual: result.status };
      },
    },
    {
      id: "nutrition-country-mix-denied",
      boundary: "isolation",
      country: "US",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = evaluateNutritionEligibility(eligibilityContext({ countryOfCare: "US" }), eligibilityPolicy);
        return { passed: result.status === "excluded" && result.reasonCodes.includes("country_mismatch"), actual: result.status };
      },
    },
    {
      id: "texture-grape-transform",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: grapeContext.rulePack.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => ({
        passed: grapeTexture.ok && grapeTexture.disposition.status === "transform_required"
          && grapeTexture.disposition.transformations[0]?.to.formCode === "quarter_lengthwise",
        actual: grapeTexture.ok ? grapeTexture.disposition.status : grapeTexture.reasonCode,
        visible: grapeTexture.ok ? grapeTexture.disposition.approvedText : null,
      }),
    },
    {
      id: "texture-blw-cannot-bypass",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: grapeContext.rulePack.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const blw = evaluateTextureSafety(scope(), grapeRequest, { ...grapeContext, feedingApproach: "blw" });
        return { passed: canonicalize(blw) === canonicalize(grapeTexture), actual: blw.ok ? blw.disposition.status : blw.reasonCode };
      },
    },
    {
      id: "texture-unknown-review",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: grapeContext.rulePack.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = evaluateTextureSafety(scope(), presentation("grape", "unknown"), grapeContext);
        return { passed: result.ok && result.disposition.status === "review_required", actual: result.ok ? result.disposition.status : result.reasonCode };
      },
    },
    {
      id: "texture-whole-nut-excluded",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: "nutrition-co-texture-eval",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const rule = textureRule("nut", "whole_nut", "excluded");
        const result = evaluateTextureSafety(scope(), presentation("nut", "whole_nut"), textureContext("nut", rule));
        return { passed: result.ok && result.disposition.status === "excluded", actual: result.ok ? result.disposition.status : result.reasonCode };
      },
    },
    {
      id: "nutrition-urgent-terminal-only",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = applyNutritionAbstention(scope(), abstentionContext(grapeComposition, grapeTexture, {
          safetyDecision: { decision: "urgent", responseMode: "emergency_recommendation", ruleCodes: ["synthetic_reaction"], copyKey: "emergency_department_es_co_v1" },
        }));
        return { passed: result.status === "emergency_only" && Object.keys(result).length === 3, actual: result.status, visible: result };
      },
    },
    {
      id: "nutrition-reaction-professional-review",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const base = abstentionContext(grapeComposition, grapeTexture);
        const result = applyNutritionAbstention(scope(), { ...base, signals: { ...base.signals, reaction: "active" } });
        return { passed: result.status === "professional_review" && !containsLeakage(result.status === "professional_review" ? result.recommendation : null), actual: result.status, visible: result.status === "professional_review" ? result.recommendation : null };
      },
    },
    {
      id: "nutrition-package-drift-abstains",
      boundary: "nutrition",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds,
      packageId: eligibilityPolicy.governance.packageId,
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const base = abstentionContext(grapeComposition, grapeTexture);
        const successful = base.content as Extract<NutritionContentResolution, { ok: true }>;
        const result = applyNutritionAbstention(scope(), { ...base, content: { ...successful, value: { ...successful.value, approvalRecordDigest: DIGEST_D } } as NutritionContentResolution });
        return { passed: result.status === "insufficient_data", actual: result.status };
      },
    },
    {
      id: "ead-caregiver-surface-allowed",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = enforceProfessionalFrameworkBoundary(scope(), eadRequest(), eadContext());
        return { passed: result.allowed && result.disposition === "caregiver_only", actual: result.audit.reasonCode, visible: result };
      },
    },
    {
      id: "ead-scoring-denied",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = enforceProfessionalFrameworkBoundary(scope(), eadRequest({ capability: "scoring" }), eadContext());
        return { passed: !result.allowed && result.audit.reasonCode === "PROFESSIONAL_ONLY", actual: result.audit.reasonCode, visible: result };
      },
    },
    {
      id: "ead-encoded-injection-denied",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = enforceProfessionalFrameworkBoundary(scope(), eadRequest({ attachmentLabels: ["manual_RUFELTM=_reference.pdf"] }), eadContext());
        return { passed: !result.allowed && result.audit.reasonCode === "PROFESSIONAL_ONLY", actual: result.audit.reasonCode, visible: result };
      },
    },
    {
      id: "ead-sibling-scope-denied",
      boundary: "isolation",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const sibling = scope({ childId: "00000000-0000-4000-8000-000000000099" });
        const result = enforceProfessionalFrameworkBoundary(scope(), eadRequest(), eadContext({ revalidatedScope: sibling }));
        return { passed: !result.allowed && result.audit.reasonCode === "NOT_AUTHORIZED", actual: result.audit.reasonCode };
      },
    },
    {
      id: "observation-neutral-fact-valid",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: false,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => ({ passed: firstObservation.ok, actual: firstObservation.ok ? firstObservation.status : firstObservation.reasonCode }),
    },
    {
      id: "observation-diagnosis-rejected",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = validateDevelopmentObservation(observation("The child has developmental delay."), observationContext());
        return { passed: !result.ok && result.reasonCode === "CLINICAL_CLAIM_FORBIDDEN", actual: result.ok ? result.status : result.reasonCode, visible: result };
      },
    },
    {
      id: "observation-ead-reference-rejected",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = validateDevelopmentObservation(observation("Caregiver noticed reaching.", "ead3-item-1"), observationContext());
        return { passed: !result.ok && result.reasonCode === "PROFESSIONAL_REFERENCE_FORBIDDEN", actual: result.ok ? result.status : result.reasonCode, visible: result };
      },
    },
    {
      id: "observation-replay-digest-stable",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-co-caregiver",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const second = validateDevelopmentObservation(structuredClone(neutralDraft), structuredClone(observationContext()));
        const passed = firstObservation.ok && second.ok && firstObservation.confirmationDigest === second.confirmationDigest;
        return { passed, actual: passed ? "stable" : "drift" };
      },
    },
    {
      id: "attachment-private-same-child-allowed",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-attachment-policy",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const result = evaluateDevelopmentAttachment(scope(), attachmentEvidence(), { cutoff: NOW, revalidatedScope: scope(), policy: attachmentPolicy() });
        return { passed: result.ok && result.disposition === "allowed" && !("url" in result), actual: result.ok ? result.disposition : result.reasonCodes.join("+") };
      },
    },
    {
      id: "attachment-public-url-denied",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-attachment-policy",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const base = attachmentEvidence();
        const result = evaluateDevelopmentAttachment(scope(), { ...base, storage: { ...base.storage, visibility: "public", permanentUrl: "https://example.invalid/public" } }, { cutoff: NOW, revalidatedScope: scope(), policy: attachmentPolicy() });
        return { passed: !result.ok && result.reasonCodes.includes("PUBLIC_ACCESS_FORBIDDEN"), actual: result.ok ? result.disposition : result.reasonCodes.join("+"), visible: result };
      },
    },
    {
      id: "attachment-sibling-denied",
      boundary: "isolation",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-attachment-policy",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const sibling = scope({ childId: "00000000-0000-4000-8000-000000000099" });
        const result = evaluateDevelopmentAttachment(scope(), attachmentEvidence(), { cutoff: NOW, revalidatedScope: sibling, policy: attachmentPolicy() });
        return { passed: !result.ok && result.reasonCodes.includes("SCOPE_MISMATCH"), actual: result.ok ? result.disposition : result.reasonCodes.join("+") };
      },
    },
    {
      id: "attachment-retention-revoked-denied",
      boundary: "development",
      country: "CO",
      ageDays: age.ageDays,
      critical: true,
      sourceIds: developmentSources,
      packageId: "development-attachment-policy",
      approvalDigest: APPROVAL_RECORD,
      run: () => {
        const base = attachmentEvidence();
        const result = evaluateDevelopmentAttachment(scope(), { ...base, retention: { ...base.retention, current: false, revoked: true } }, { cutoff: NOW, revalidatedScope: scope(), policy: attachmentPolicy() });
        return { passed: !result.ok && result.reasonCodes.includes("RETENTION_INVALID"), actual: result.ok ? result.disposition : result.reasonCodes.join("+") };
      },
    },
  ];
}

export function runNutritionDevelopmentEval(): NutritionDevelopmentEvalResult {
  const definitions = cases();
  const evaluated: EvalCaseResult[] = definitions.map(({ run, ...definition }) => {
    try {
      const result = run();
      return { ...definition, passed: result.passed, actual: result.actual, leakage: result.visible === undefined ? false : containsLeakage(result.visible) };
    } catch {
      return { ...definition, passed: false, actual: "exception", leakage: false };
    }
  });
  const failed = evaluated.filter((entry) => !entry.passed).length;
  const criticalDiscrepancies = evaluated.filter((entry) => entry.critical && !entry.passed).length;
  const leakageFindings = evaluated.filter((entry) => entry.leakage).length;
  const isolationFailures = evaluated.filter((entry) => entry.boundary === "isolation" && !entry.passed).length;
  const provenanceGaps = evaluated.filter((entry) => entry.sourceIds.length === 0
    || entry.packageId.length === 0 || entry.approvalDigest !== APPROVAL_RECORD).length;
  const countryCase = evaluated.find((entry) => entry.id === "nutrition-country-mix-denied");
  const publicCases = evaluated.map(({ id, boundary, passed, actual }) => ({ id, boundary, passed, actual }));
  return Object.freeze({
    schemaVersion: "nutrition-development-eval-v1",
    provider: "none",
    reviewer: "root_engineering_with_conveyed_clinical_approval",
    passed: evaluated.length - failed,
    failed,
    criticalDiscrepancies,
    leakageFindings,
    isolationFailures,
    provenanceGaps,
    crossCountryMixes: countryCase?.passed === true ? 0 : 1,
    caseCount: evaluated.length,
    caseDigest: digest(evaluated.map(({ id, boundary, country, ageDays, critical, sourceIds, packageId, approvalDigest, passed, actual, leakage }) => ({
      id, boundary, country, ageDays, critical, sourceIds, packageId, approvalDigest, passed, actual, leakage,
    }))),
    cases: Object.freeze(publicCases),
  });
}

describe("nutrition and development deterministic eval", () => {
  it("has zero critical, leakage, provenance, isolation, or country-mix failures", () => {
    const result = runNutritionDevelopmentEval();

    expect(result.caseCount).toBe(23);
    expect(result.failed, JSON.stringify(result.cases.filter((entry) => !entry.passed))).toBe(0);
    expect(result.passed).toBe(result.caseCount);
    expect(result.criticalDiscrepancies).toBe(0);
    expect(result.leakageFindings).toBe(0);
    expect(result.isolationFailures).toBe(0);
    expect(result.provenanceGaps).toBe(0);
    expect(result.crossCountryMixes).toBe(0);
    expect(result.caseDigest).toBe("ec94522e79250d9dc0867eaf5eb68f489910ab9d7dfc3b918e454170ff929793");
  });
});
