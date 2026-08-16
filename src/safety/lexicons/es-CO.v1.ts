import type { SafetyLocale } from "../message-types";

export type LexiconEntry = Readonly<{
  code: string;
  variants: readonly string[];
  locale: SafetyLocale;
  reviewSourceId: string;
  canonicalToken: string;
}>;

export const ES_CO_LEXICON_V1: readonly LexiconEntry[] = Object.freeze([
  { code: "variant.fever", variants: ["fiebre", "calentura"], locale: "es-CO", reviewSourceId: "synthetic-lexicon-es-co-v1", canonicalToken: "fiebre" },
  { code: "variant.breathing", variants: ["respirar", "respirando", "ahogo"], locale: "es-CO", reviewSourceId: "synthetic-lexicon-es-co-v1", canonicalToken: "respirar" },
  { code: "variant.seizure", variants: ["convulsion", "convulsión"], locale: "es-CO", reviewSourceId: "synthetic-lexicon-es-co-v1", canonicalToken: "convulsion" },
  { code: "variant.vomit", variants: ["vomito", "vómito", "vomitar"], locale: "es-CO", reviewSourceId: "synthetic-lexicon-es-co-v1", canonicalToken: "vomito" },
]);
