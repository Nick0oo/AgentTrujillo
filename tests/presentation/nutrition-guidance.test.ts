import { describe, expect, it } from "vitest";

import {
  NUTRITION_GUIDANCE_WIDGET_SCHEMA,
  NutritionGuidancePresentationError,
  presentNutritionGuidance,
} from "../../src/presentation/nutrition-guidance";
import type { SuggestPediatricNutritionTrustedResult } from "../../agent/tools/suggest_pediatric_nutrition";
import { GENERIC_PROFESSIONAL_REVIEW_COPIES } from "../../src/safety/professional-review-copy";

const HANDLE_A = `citation:v1:${"a".repeat(64)}`;
const HANDLE_B = `citation:v1:${"b".repeat(64)}`;
type EducationalResult = Omit<SuggestPediatricNutritionTrustedResult, "data"> & Readonly<{
  data: Extract<SuggestPediatricNutritionTrustedResult["data"], { status: "educational_guidance" }>;
}>;
type InsufficientResult = Omit<SuggestPediatricNutritionTrustedResult, "data"> & Readonly<{
  data: Extract<SuggestPediatricNutritionTrustedResult["data"], { status: "insufficient_data" }>;
}>;
type ProfessionalResult = Omit<SuggestPediatricNutritionTrustedResult, "data"> & Readonly<{
  data: Extract<SuggestPediatricNutritionTrustedResult["data"], { status: "professional_review" }>;
}>;

function citation(handle = HANDLE_A, sourceId = "icbf-guidance") {
  return {
    sourceId,
    sourceVersion: "2026.1",
    license: "Approved educational use",
    citationHandle: handle,
  };
}

function educationalResult(): EducationalResult {
  const sourceA = citation();
  const sourceB = citation(HANDLE_B, "minsalud-texture");
  const guidance = {
    contentId: "guidance-lentil",
    kind: "preparation" as const,
    title: "Preparación aprobada",
    text: "Ofrezca la preparación aprobada durante una comida supervisada.",
    tags: ["traditional", "blw"],
    citations: [sourceA, sourceB],
    citationHandles: [HANDLE_A, HANDLE_B],
  };
  return {
    kind: "trusted_tool_result" as const,
    toolId: "suggest_pediatric_nutrition" as const,
    schemaVersion: "suggest_pediatric_nutrition.trusted.v1" as const,
    data: {
      status: "educational_guidance" as const,
      responseMode: "educational" as const,
      blocks: [guidance],
      recipes: [{
        recipeId: "recipe-lentil",
        title: "Lentejas preparadas",
        ingredientCodes: ["lentil", "carrot"],
        preparationSteps: ["Cocine los ingredientes.", "Triture hasta la textura indicada."],
        texture: "soft_lumpy" as const,
        supervision: "required" as const,
        guidance: [guidance],
        allowedSubstitutions: [{
          kind: "whole_recipe" as const,
          recipeId: "recipe-beans",
          title: "Fríjoles preparados",
          ingredientCodes: ["bean", "carrot"],
        }],
        transformations: [],
        approvedTextureText: [],
        citations: [sourceA, sourceB],
        citationHandles: [HANDLE_A, HANDLE_B],
      }],
      exclusions: [
        { contentId: "recipe-egg", reasonCodes: ["declared_allergy"] },
        { contentId: "recipe-milk", reasonCodes: ["profile_exclusion"] },
      ],
      provenance: {
        packageId: "nutrition-co",
        packageVersion: "1.0.0",
        algorithmId: "nutrition-guidance",
        algorithmVersion: "nutrition-guidance.v1",
        jurisdiction: "CO" as const,
        locale: "es-CO" as const,
        contentStatus: "released_approved" as const,
        rightsStatus: "verified" as const,
        citations: [sourceA, sourceB],
      },
    },
  };
}

function insufficientResult(): InsufficientResult {
  return {
    kind: "trusted_tool_result" as const,
    toolId: "suggest_pediatric_nutrition" as const,
    schemaVersion: "suggest_pediatric_nutrition.trusted.v1" as const,
    data: {
      status: "insufficient_data" as const,
      responseMode: "insufficient_data" as const,
      reasonCodes: ["profile_incomplete"],
      missingFacts: ["texture_stage"],
      provenance: {
        algorithmId: "nutrition-abstention",
        algorithmVersion: "nutrition-abstention.v1",
        decisionStatus: "insufficient_data" as const,
        locale: "es-CO" as const,
      },
    },
  };
}

function professionalResult(): ProfessionalResult {
  const approved = GENERIC_PROFESSIONAL_REVIEW_COPIES["es-CO"];
  return {
    kind: "trusted_tool_result" as const,
    toolId: "suggest_pediatric_nutrition" as const,
    schemaVersion: "suggest_pediatric_nutrition.trusted.v1" as const,
    data: {
      status: "professional_review" as const,
      responseMode: "pediatrician_recommendation" as const,
      reasonCodes: ["professional_plan_active"],
      recommendation: {
        type: "pediatrician_recommendation" as const,
        text: approved.text,
        locale: approved.locale,
        messageId: approved.messageId,
      },
      provenance: {
        algorithmId: "nutrition-abstention",
        algorithmVersion: "nutrition-abstention.v1",
        decisionStatus: "professional_review" as const,
        locale: "es-CO" as const,
      },
    },
  };
}

describe("presentNutritionGuidance", () => {
  it("renders approved blocks, ingredients, exclusions, texture, supervision, citations and accessible fallback", () => {
    const widget = presentNutritionGuidance(educationalResult(), "es-CO");

    expect(NUTRITION_GUIDANCE_WIDGET_SCHEMA.safeParse(widget).success).toBe(true);
    expect(widget).toMatchObject({
      kind: "nutrition_guidance",
      version: "nutrition.guidance.v1",
      data: {
        status: "educational_guidance",
        locale: "es-CO",
        blocks: [{ contentId: "guidance-lentil", text: "Ofrezca la preparación aprobada durante una comida supervisada." }],
        recipes: [{
          recipeId: "recipe-lentil",
          ingredientCodes: ["lentil", "carrot"],
          texture: { code: "soft_lumpy" },
          supervision: { code: "required" },
          preparation: { source: "approved_recipe", steps: ["Cocine los ingredientes.", "Triture hasta la textura indicada."] },
        }],
        exclusions: [
          { contentId: "recipe-egg", reasonCodes: ["declared_allergy"] },
          { contentId: "recipe-milk", reasonCodes: ["profile_exclusion"] },
        ],
        citations: [{ citationHandle: HANDLE_A }, { citationHandle: HANDLE_B }],
        sourceDisclosure: { packageId: "nutrition-co", contentStatus: "released_approved", rightsStatus: "verified" },
      },
    });
    expect(widget.data.screenReaderSummary).toContain("1 receta");
    expect(widget.data.fallbackText).toContain("Lentejas preparadas");
    expect(widget.data.fallbackText).toContain("lentil, carrot");
    expect(widget.data.fallbackText).toContain("Cocine los ingredientes.");
    expect(widget.data.fallbackText).toContain("Fríjoles preparados (bean, carrot)");
    expect(widget.data.fallbackText).toContain("Paquete nutrition-co, versión 1.0.0");
    expect(JSON.stringify(widget)).not.toMatch(/actions?|button|javascript|https?:\/\//iu);
  });

  it("uses only approved texture text when a transformation is required", () => {
    const raw = educationalResult();
    raw.data.recipes[0]!.transformations = [{
      ingredientCode: "carrot",
      from: { formCode: "round", shapeCode: "coin", sizeCode: "large", textureCode: "firm" },
      to: { formCode: "cooked", shapeCode: "strip", sizeCode: "adult_finger", textureCode: "soft" },
      approvedBlockId: "texture-carrot",
    }];
    raw.data.recipes[0]!.approvedTextureText = [{
      blockId: "texture-carrot",
      text: "Cocine y presente en tiras blandas según el contenido aprobado.",
    }];

    const widget = presentNutritionGuidance(raw, "es-CO");
    if (widget.data.status !== "educational_guidance") throw new Error("expected educational widget");
    expect(widget.data.recipes[0]!.preparation).toEqual({
      source: "approved_texture_transformation",
      steps: ["Cocine y presente en tiras blandas según el contenido aprobado."],
      transformations: raw.data.recipes[0]!.transformations,
    });
    expect(widget.data.fallbackText).not.toContain("Triture hasta");
  });

  it("renders an accessible insufficient-data abstention without inventing guidance", () => {
    const widget = presentNutritionGuidance(insufficientResult(), "es-CO");
    expect(widget.data).toMatchObject({
      status: "insufficient_data",
      reasonCodes: ["profile_incomplete"],
      missingFacts: ["texture_stage"],
    });
    expect(widget.data.fallbackText).toBe(widget.data.screenReaderSummary);
    expect(JSON.stringify(widget)).not.toContain("recipes");
  });

  it("renders an empty approved result and locale-specific labels without inventing content", () => {
    const empty = educationalResult();
    empty.data.blocks = [];
    empty.data.recipes = [];
    empty.data.exclusions = [];
    empty.data.provenance.citations = [];
    const emptyWidget = presentNutritionGuidance(empty, "es-CO");
    expect(emptyWidget.data).toMatchObject({ status: "educational_guidance", blocks: [], recipes: [], exclusions: [] });
    expect(emptyWidget.data.fallbackText).toContain("0 bloques, 0 recetas y 0 exclusiones");

    const english = educationalResult();
    english.data.provenance.locale = "en-US";
    const englishWidget = presentNutritionGuidance(english, "en-US");
    if (englishWidget.data.status !== "educational_guidance") throw new Error("expected educational widget");
    expect(englishWidget.data.title).toBe("Nutrition guidance");
    expect(englishWidget.data.recipes[0]!.supervision.label).toBe("Supervision required");
  });

  it("preserves only the exact generic professional recommendation as inert text", () => {
    const widget = presentNutritionGuidance(professionalResult(), "es-CO");
    const approved = GENERIC_PROFESSIONAL_REVIEW_COPIES["es-CO"];
    expect(widget.data).toMatchObject({
      status: "professional_review",
      recommendation: { messageId: approved.messageId, text: approved.text },
      fallbackText: approved.text,
    });
    expect(JSON.stringify(widget)).not.toMatch(/action|contact|agenda|notific|transfer|doctor reviewed/iu);
  });

  it("rejects non-approved professional wording", () => {
    const raw = professionalResult();
    raw.data.recommendation.text = "Ya notificamos al médico.";
    expect(() => presentNutritionGuidance(raw, "es-CO")).toThrow(NutritionGuidancePresentationError);
  });

  it("rejects locale, source, citation and content-consistency drift", () => {
    expect(() => presentNutritionGuidance(educationalResult(), "en-US")).toThrow(NutritionGuidancePresentationError);

    const missingCitation = educationalResult();
    missingCitation.data.provenance.citations = [missingCitation.data.provenance.citations[0]!];
    expect(() => presentNutritionGuidance(missingCitation, "es-CO")).toThrow(NutritionGuidancePresentationError);

    const conflictingCitation = educationalResult();
    conflictingCitation.data.recipes[0]!.citations[0] = citation(HANDLE_A, "different-source");
    expect(() => presentNutritionGuidance(conflictingCitation, "es-CO")).toThrow(NutritionGuidancePresentationError);

    const detachedGuidance = educationalResult();
    detachedGuidance.data.recipes[0]!.guidance[0] = {
      ...detachedGuidance.data.recipes[0]!.guidance[0]!,
      text: "Texto aprobado diferente.",
    };
    expect(() => presentNutritionGuidance(detachedGuidance, "es-CO")).toThrow(NutritionGuidancePresentationError);
  });

  it("rejects transformation references outside the approved recipe closure", () => {
    const wrongIngredient = educationalResult();
    wrongIngredient.data.recipes[0]!.transformations = [{
      ingredientCode: "foreign-ingredient",
      from: { formCode: "a", shapeCode: "b", sizeCode: "c", textureCode: "d" },
      to: { formCode: "e", shapeCode: "f", sizeCode: "g", textureCode: "h" },
      approvedBlockId: "texture-foreign",
    }];
    wrongIngredient.data.recipes[0]!.approvedTextureText = [{ blockId: "texture-foreign", text: "Texto aprobado." }];
    expect(() => presentNutritionGuidance(wrongIngredient, "es-CO")).toThrow(NutritionGuidancePresentationError);

    const missingApprovedText = educationalResult();
    missingApprovedText.data.recipes[0]!.transformations = [{
      ingredientCode: "carrot",
      from: { formCode: "a", shapeCode: "b", sizeCode: "c", textureCode: "d" },
      to: { formCode: "e", shapeCode: "f", sizeCode: "g", textureCode: "h" },
      approvedBlockId: "texture-missing",
    }];
    expect(() => presentNutritionGuidance(missingApprovedText, "es-CO")).toThrow(NutritionGuidancePresentationError);
  });

  it("rejects malicious markup, executable text, unknown fields and malformed status", () => {
    const markup = educationalResult();
    markup.data.blocks[0]!.text = "<script>alert(1)</script>";
    expect(() => presentNutritionGuidance(markup, "es-CO")).toThrow(NutritionGuidancePresentationError);

    const executableLicense = educationalResult();
    executableLicense.data.provenance.citations[0]!.license = "javascript:run";
    expect(() => presentNutritionGuidance(executableLicense, "es-CO")).toThrow(NutritionGuidancePresentationError);

    const unknown = { ...educationalResult(), childId: "forged-child" };
    expect(() => presentNutritionGuidance(unknown, "es-CO")).toThrow(NutritionGuidancePresentationError);

    const malformed = educationalResult() as unknown as { data: { status: string } };
    malformed.data.status = "emergency";
    expect(() => presentNutritionGuidance(malformed, "es-CO")).toThrow(NutritionGuidancePresentationError);
  });

  it("is deterministic, deeply immutable and rejects extra widget fields", () => {
    const first = presentNutritionGuidance(educationalResult(), "es-CO");
    const second = presentNutritionGuidance(educationalResult(), "es-CO");
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.data)).toBe(true);
    if (first.data.status !== "educational_guidance") throw new Error("expected educational widget");
    expect(Object.isFrozen(first.data.recipes[0]!.preparation.steps)).toBe(true);
    expect(NUTRITION_GUIDANCE_WIDGET_SCHEMA.safeParse({ ...first, action: "contact_clinician" }).success).toBe(false);
  });
});
