import type { SafetyLocale } from "../message-types";
import type { LexiconEntry } from "./es-CO.v1";

export const EN_US_LEXICON_V1: readonly LexiconEntry[] = Object.freeze([
  { code: "variant.fever", variants: ["fever", "temperature"], locale: "en-US", reviewSourceId: "synthetic-lexicon-en-us-v1", canonicalToken: "fever" },
  { code: "variant.breathing", variants: ["breathing", "breathless", "choking"], locale: "en-US", reviewSourceId: "synthetic-lexicon-en-us-v1", canonicalToken: "breathing" },
  { code: "variant.seizure", variants: ["seizure", "convulsion"], locale: "en-US", reviewSourceId: "synthetic-lexicon-en-us-v1", canonicalToken: "seizure" },
  { code: "variant.vomit", variants: ["vomit", "vomiting"], locale: "en-US", reviewSourceId: "synthetic-lexicon-en-us-v1", canonicalToken: "vomit" },
]);
