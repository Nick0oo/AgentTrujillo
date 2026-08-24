import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA,
  type SuggestPediatricNutritionTrustedResult,
} from "../../agent/tools/suggest_pediatric_nutrition";
import {
  GENERIC_PROFESSIONAL_REVIEW_COPIES,
  validateProfessionalReviewCopy,
} from "../safety/professional-review-copy";

const LOCALE = z.enum(["es-CO", "en-US"]);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
function isSafeText(value: string): boolean {
  return (
    value === value.normalize("NFKC")
      && !/[\u0000-\u001f\u007f<>`]/u.test(value)
      && !/(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu.test(value)
  );
}
const SAFE_TEXT = z.string().min(1).max(8_000).refine(isSafeText, "unsafe_text");
const ACCESSIBLE_TEXT = z.string().min(1).max(256_000).refine(isSafeText, "unsafe_text");
const TEXTURE = z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "unknown"]);
const SUPERVISION = z.enum(["required", "recommended"]);

const CITATION_SCHEMA = z.object({
  sourceId: CODE,
  sourceVersion: CODE,
  license: SAFE_TEXT.max(256),
  citationHandle: CITATION_HANDLE,
}).strict();

const BLOCK_SCHEMA = z.object({
  contentId: CODE,
  kind: z.enum(["education", "feeding", "preparation", "safety", "exclusion"]),
  title: SAFE_TEXT.max(160),
  text: SAFE_TEXT,
  tags: z.array(CODE).max(50),
  citationHandles: z.array(CITATION_HANDLE).min(1).max(16),
}).strict();

const TEXTURE_FORM_SCHEMA = z.object({
  formCode: CODE,
  shapeCode: CODE,
  sizeCode: CODE,
  textureCode: CODE,
}).strict();

const TRANSFORMATION_SCHEMA = z.object({
  ingredientCode: CODE,
  from: TEXTURE_FORM_SCHEMA,
  to: TEXTURE_FORM_SCHEMA,
  approvedBlockId: CODE,
}).strict();

const PREPARATION_SCHEMA = z.object({
  source: z.enum(["approved_recipe", "approved_texture_transformation"]),
  steps: z.array(SAFE_TEXT.max(4_000)).min(1).max(16),
  transformations: z.array(TRANSFORMATION_SCHEMA).max(24),
}).strict();

const SUBSTITUTION_SCHEMA = z.object({
  kind: z.literal("whole_recipe"),
  recipeId: CODE,
  title: SAFE_TEXT.max(160),
  ingredientCodes: z.array(CODE).min(1).max(24),
}).strict();

const RECIPE_SCHEMA = z.object({
  recipeId: CODE,
  title: SAFE_TEXT.max(160),
  ingredientCodes: z.array(CODE).min(1).max(24),
  texture: z.object({ code: TEXTURE, label: SAFE_TEXT.max(120) }).strict(),
  supervision: z.object({ code: SUPERVISION, label: SAFE_TEXT.max(120) }).strict(),
  preparation: PREPARATION_SCHEMA,
  guidanceContentIds: z.array(CODE).max(16),
  allowedSubstitutions: z.array(SUBSTITUTION_SCHEMA).max(8),
  citationHandles: z.array(CITATION_HANDLE).min(1).max(16),
}).strict();

const EXCLUSION_SCHEMA = z.object({
  contentId: CODE,
  reasonCodes: z.array(CODE).min(1).max(8),
}).strict();

const SOURCE_DISCLOSURE_SCHEMA = z.object({
  packageId: CODE,
  packageVersion: CODE,
  algorithmId: CODE,
  algorithmVersion: CODE,
  jurisdiction: z.enum(["CO", "US"]),
  contentStatus: z.literal("released_approved"),
  rightsStatus: z.literal("verified"),
}).strict();

const ABSTENTION_PROVENANCE_SCHEMA = z.object({
  algorithmId: CODE,
  algorithmVersion: CODE,
  decisionStatus: z.enum(["insufficient_data", "professional_review"]),
  locale: LOCALE,
}).strict();

const EDUCATIONAL_DATA_SCHEMA = z.object({
  status: z.literal("educational_guidance"),
  locale: LOCALE,
  title: SAFE_TEXT.max(160),
  blocks: z.array(BLOCK_SCHEMA).max(16),
  recipes: z.array(RECIPE_SCHEMA).max(1),
  exclusions: z.array(EXCLUSION_SCHEMA).max(24),
  citations: z.array(CITATION_SCHEMA).max(16),
  sourceDisclosure: SOURCE_DISCLOSURE_SCHEMA,
  screenReaderSummary: ACCESSIBLE_TEXT,
  fallbackText: ACCESSIBLE_TEXT,
}).strict();

const INSUFFICIENT_DATA_SCHEMA = z.object({
  status: z.literal("insufficient_data"),
  locale: LOCALE,
  title: SAFE_TEXT.max(160),
  reasonCodes: z.array(CODE).min(1).max(8),
  missingFacts: z.array(CODE).max(8),
  provenance: ABSTENTION_PROVENANCE_SCHEMA.nullable(),
  screenReaderSummary: ACCESSIBLE_TEXT,
  fallbackText: ACCESSIBLE_TEXT,
}).strict();

const PROFESSIONAL_REVIEW_SCHEMA = z.object({
  status: z.literal("professional_review"),
  locale: LOCALE,
  title: SAFE_TEXT.max(160),
  reasonCodes: z.array(CODE).min(1).max(8),
  recommendation: z.object({
    type: z.literal("pediatrician_recommendation"),
    messageId: CODE,
    text: SAFE_TEXT.max(280),
  }).strict(),
  provenance: ABSTENTION_PROVENANCE_SCHEMA,
  screenReaderSummary: ACCESSIBLE_TEXT,
  fallbackText: ACCESSIBLE_TEXT,
}).strict();

export const NUTRITION_GUIDANCE_WIDGET_SCHEMA = z.object({
  kind: z.literal("nutrition_guidance"),
  version: z.literal("nutrition.guidance.v1"),
  data: z.discriminatedUnion("status", [
    EDUCATIONAL_DATA_SCHEMA,
    INSUFFICIENT_DATA_SCHEMA,
    PROFESSIONAL_REVIEW_SCHEMA,
  ]),
}).strict();

export type NutritionGuidanceWidget = Readonly<z.infer<typeof NUTRITION_GUIDANCE_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE>;
type TrustedResult = SuggestPediatricNutritionTrustedResult;
type EducationalData = Extract<TrustedResult["data"], { status: "educational_guidance" }>;
type TrustedCitation = EducationalData["provenance"]["citations"][number];
type TrustedBlock = EducationalData["blocks"][number];
type TrustedRecipe = EducationalData["recipes"][number];

export class NutritionGuidancePresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Nutrition guidance presentation contract invalid");
    this.name = "NutritionGuidancePresentationError";
  }
}

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Orientación nutricional",
    insufficient: "No hay información suficiente para mostrar orientación nutricional.",
    summary: (blocks: number, recipes: number, exclusions: number) =>
      `Orientación nutricional con ${blocks} ${blocks === 1 ? "bloque" : "bloques"}, ${recipes} ${recipes === 1 ? "receta" : "recetas"} y ${exclusions} ${exclusions === 1 ? "exclusión" : "exclusiones"}.`,
    texture: {
      smooth_puree: "Puré suave",
      mashed: "Triturado",
      soft_lumpy: "Blando con grumos",
      finger_food: "Alimento para tomar con la mano",
      family_food: "Comida familiar",
      unknown: "Textura no disponible",
    },
    supervision: { required: "Supervisión requerida", recommended: "Supervisión recomendada" },
    recipe: (recipe: z.infer<typeof RECIPE_SCHEMA>) =>
      `${recipe.title}. Ingredientes: ${recipe.ingredientCodes.join(", ")}. Textura: ${recipe.texture.label}. ${recipe.supervision.label}. Preparación: ${recipe.preparation.steps.join(" ")}${recipe.allowedSubstitutions.length === 0 ? "" : ` Alternativas completas: ${recipe.allowedSubstitutions.map((item) => `${item.title} (${item.ingredientCodes.join(", ")})`).join("; ")}.`}`,
    exclusion: (item: z.infer<typeof EXCLUSION_SCHEMA>) =>
      `Contenido excluido ${item.contentId}; razones: ${item.reasonCodes.join(", ")}.`,
    source: (item: z.infer<typeof CITATION_SCHEMA>) =>
      `Fuente ${item.sourceId}, versión ${item.sourceVersion}, licencia ${item.license}.`,
    package: (item: z.infer<typeof SOURCE_DISCLOSURE_SCHEMA>) =>
      `Paquete ${item.packageId}, versión ${item.packageVersion}, jurisdicción ${item.jurisdiction}, algoritmo ${item.algorithmId} ${item.algorithmVersion}.`,
  }),
  "en-US": Object.freeze({
    title: "Nutrition guidance",
    insufficient: "There is not enough information to display nutrition guidance.",
    summary: (blocks: number, recipes: number, exclusions: number) =>
      `Nutrition guidance with ${blocks} ${blocks === 1 ? "block" : "blocks"}, ${recipes} ${recipes === 1 ? "recipe" : "recipes"}, and ${exclusions} ${exclusions === 1 ? "exclusion" : "exclusions"}.`,
    texture: {
      smooth_puree: "Smooth puree",
      mashed: "Mashed",
      soft_lumpy: "Soft and lumpy",
      finger_food: "Finger food",
      family_food: "Family food",
      unknown: "Texture unavailable",
    },
    supervision: { required: "Supervision required", recommended: "Supervision recommended" },
    recipe: (recipe: z.infer<typeof RECIPE_SCHEMA>) =>
      `${recipe.title}. Ingredients: ${recipe.ingredientCodes.join(", ")}. Texture: ${recipe.texture.label}. ${recipe.supervision.label}. Preparation: ${recipe.preparation.steps.join(" ")}${recipe.allowedSubstitutions.length === 0 ? "" : ` Whole-recipe alternatives: ${recipe.allowedSubstitutions.map((item) => `${item.title} (${item.ingredientCodes.join(", ")})`).join("; ")}.`}`,
    exclusion: (item: z.infer<typeof EXCLUSION_SCHEMA>) =>
      `Excluded content ${item.contentId}; reasons: ${item.reasonCodes.join(", ")}.`,
    source: (item: z.infer<typeof CITATION_SCHEMA>) =>
      `Source ${item.sourceId}, version ${item.sourceVersion}, license ${item.license}.`,
    package: (item: z.infer<typeof SOURCE_DISCLOSURE_SCHEMA>) =>
      `Package ${item.packageId}, version ${item.packageVersion}, jurisdiction ${item.jurisdiction}, algorithm ${item.algorithmId} ${item.algorithmVersion}.`,
  }),
});

function fail(): never {
  throw new NutritionGuidancePresentationError();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function exactUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function citationIdentity(citation: TrustedCitation): string {
  return canonicalize(citation);
}

function validateCitationClosure(data: EducationalData): Map<string, TrustedCitation> {
  const citations = new Map<string, TrustedCitation>();
  for (const citation of data.provenance.citations) {
    const current = citations.get(citation.citationHandle);
    if (current && citationIdentity(current) !== citationIdentity(citation)) fail();
    if (current) fail();
    citations.set(citation.citationHandle, citation);
  }

  const validate = (owned: readonly TrustedCitation[], handles: readonly string[]) => {
    if (!exactUnique(handles) || owned.length !== handles.length) fail();
    if (!owned.every((citation, index) => citation.citationHandle === handles[index])) fail();
    for (const citation of owned) {
      const trusted = citations.get(citation.citationHandle);
      if (!trusted || citationIdentity(trusted) !== citationIdentity(citation)) fail();
    }
  };

  for (const block of data.blocks) validate(block.citations, block.citationHandles);
  for (const recipe of data.recipes) {
    validate(recipe.citations, recipe.citationHandles);
    for (const block of recipe.guidance) validate(block.citations, block.citationHandles);
  }
  return citations;
}

function validateContentClosure(data: EducationalData): void {
  if (!exactUnique(data.blocks.map(({ contentId }) => contentId))
    || !exactUnique(data.recipes.map(({ recipeId }) => recipeId))
    || !exactUnique(data.exclusions.map(({ contentId }) => contentId))) fail();

  const blocks = new Map(data.blocks.map((block) => [block.contentId, block]));
  const referencedBlocks = new Set<string>();
  for (const recipe of data.recipes) {
    if (!exactUnique(recipe.ingredientCodes)
      || !exactUnique(recipe.guidance.map(({ contentId }) => contentId))
      || !exactUnique(recipe.allowedSubstitutions.map(({ recipeId }) => recipeId))) fail();
    for (const guidance of recipe.guidance) {
      const trusted = blocks.get(guidance.contentId);
      if (!trusted || !sameValue(trusted, guidance)) fail();
      referencedBlocks.add(guidance.contentId);
    }

    const approvedTextIds = new Set(recipe.approvedTextureText.map(({ blockId }) => blockId));
    if (approvedTextIds.size !== recipe.approvedTextureText.length) fail();
    const transformationIds = recipe.transformations.map((item) => `${item.ingredientCode}\u0000${item.approvedBlockId}`);
    if (!exactUnique(transformationIds)) fail();
    for (const transformation of recipe.transformations) {
      if (!recipe.ingredientCodes.includes(transformation.ingredientCode)
        || !approvedTextIds.has(transformation.approvedBlockId)) fail();
    }
    if (recipe.transformations.length > 0 && recipe.approvedTextureText.length === 0) fail();
  }
  if (blocks.size !== referencedBlocks.size) fail();
}

function blockForDisplay(block: TrustedBlock): z.infer<typeof BLOCK_SCHEMA> {
  return {
    contentId: block.contentId,
    kind: block.kind,
    title: block.title,
    text: block.text,
    tags: [...block.tags],
    citationHandles: [...block.citationHandles],
  };
}

function recipeForDisplay(recipe: TrustedRecipe, locale: Locale): z.infer<typeof RECIPE_SCHEMA> {
  const transformations = recipe.transformations.map((item) => ({
    ingredientCode: item.ingredientCode,
    from: { ...item.from },
    to: { ...item.to },
    approvedBlockId: item.approvedBlockId,
  }));
  const transformed = transformations.length > 0;
  return {
    recipeId: recipe.recipeId,
    title: recipe.title,
    ingredientCodes: [...recipe.ingredientCodes],
    texture: { code: recipe.texture, label: COPY[locale].texture[recipe.texture] },
    supervision: { code: recipe.supervision, label: COPY[locale].supervision[recipe.supervision] },
    preparation: {
      source: transformed ? "approved_texture_transformation" : "approved_recipe",
      steps: transformed
        ? recipe.approvedTextureText.map(({ text }) => text)
        : [...recipe.preparationSteps],
      transformations,
    },
    guidanceContentIds: recipe.guidance.map(({ contentId }) => contentId),
    allowedSubstitutions: recipe.allowedSubstitutions.map((item) => ({ ...item, ingredientCodes: [...item.ingredientCodes] })),
    citationHandles: [...recipe.citationHandles],
  };
}

function educationalWidget(data: EducationalData, locale: Locale): NutritionGuidanceWidget {
  if (data.provenance.locale !== locale) fail();
  const citations = validateCitationClosure(data);
  validateContentClosure(data);
  const blocks = data.blocks.map(blockForDisplay);
  const recipes = data.recipes.map((recipe) => recipeForDisplay(recipe, locale));
  const exclusions = data.exclusions.map((item) => ({ contentId: item.contentId, reasonCodes: [...item.reasonCodes] }));
  const sourceList = [...citations.values()].map((citation) => ({ ...citation }));
  const sourceDisclosure = {
    packageId: data.provenance.packageId,
    packageVersion: data.provenance.packageVersion,
    algorithmId: data.provenance.algorithmId,
    algorithmVersion: data.provenance.algorithmVersion,
    jurisdiction: data.provenance.jurisdiction,
    contentStatus: data.provenance.contentStatus,
    rightsStatus: data.provenance.rightsStatus,
  };
  const summary = COPY[locale].summary(blocks.length, recipes.length, exclusions.length);
  const fallback = [
    summary,
    ...blocks.map((block) => `${block.title}: ${block.text}`),
    ...recipes.map((recipe) => COPY[locale].recipe(recipe)),
    ...exclusions.map((item) => COPY[locale].exclusion(item)),
    ...sourceList.map((source) => COPY[locale].source(source)),
    COPY[locale].package(sourceDisclosure),
  ].join(" ");
  return finalize({
    kind: "nutrition_guidance",
    version: "nutrition.guidance.v1",
    data: {
      status: "educational_guidance",
      locale,
      title: COPY[locale].title,
      blocks,
      recipes,
      exclusions,
      citations: sourceList,
      sourceDisclosure,
      screenReaderSummary: summary,
      fallbackText: fallback,
    },
  });
}

function finalize(candidate: unknown): NutritionGuidanceWidget {
  const parsed = NUTRITION_GUIDANCE_WIDGET_SCHEMA.safeParse(candidate);
  if (!parsed.success) fail();
  return deepFreeze(parsed.data);
}

export function presentNutritionGuidance(raw: unknown, rawLocale: unknown): NutritionGuidanceWidget {
  const result = SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  const parsedLocale = LOCALE.safeParse(rawLocale);
  if (!result.success || !parsedLocale.success) fail();
  const locale = parsedLocale.data;
  const { data } = result.data;

  if (data.status === "educational_guidance") return educationalWidget(data, locale);

  if (data.status === "insufficient_data") {
    if (data.provenance !== null && data.provenance.locale !== locale) fail();
    const text = COPY[locale].insufficient;
    return finalize({
      kind: "nutrition_guidance",
      version: "nutrition.guidance.v1",
      data: {
        status: "insufficient_data",
        locale,
        title: COPY[locale].title,
        reasonCodes: [...data.reasonCodes],
        missingFacts: [...data.missingFacts],
        provenance: data.provenance === null ? null : { ...data.provenance },
        screenReaderSummary: text,
        fallbackText: text,
      },
    });
  }

  if (data.provenance.locale !== locale || data.recommendation.locale !== locale) fail();
  const approved = validateProfessionalReviewCopy(GENERIC_PROFESSIONAL_REVIEW_COPIES[locale]);
  if (data.recommendation.messageId !== approved.messageId || data.recommendation.text !== approved.text) fail();
  return finalize({
    kind: "nutrition_guidance",
    version: "nutrition.guidance.v1",
    data: {
      status: "professional_review",
      locale,
      title: COPY[locale].title,
      reasonCodes: [...data.reasonCodes],
      recommendation: {
        type: data.recommendation.type,
        messageId: data.recommendation.messageId,
        text: data.recommendation.text,
      },
      provenance: { ...data.provenance },
      screenReaderSummary: data.recommendation.text,
      fallbackText: data.recommendation.text,
    },
  });
}
