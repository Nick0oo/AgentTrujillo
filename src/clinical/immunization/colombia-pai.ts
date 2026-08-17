import { compileRulePack, type CompiledRulePack, type PackCompileResult, type RulePackInput } from "./rule-packs.ts";
import type { VaccineCatalog } from "./types.ts";
export { paiColombiaPackSchema } from "./packs/pai-colombia-schema.ts";
export type { PaiRuleKind } from "./packs/pai-colombia-schema.ts";

export type PaiColombiaPackageInput = RulePackInput;
export type PaiColombiaPackV1 = CompiledRulePack & Readonly<{ countryCode: "CO" }>;

export function compilePaiColombiaPack(input: PaiColombiaPackageInput, catalog: VaccineCatalog): PackCompileResult<PaiColombiaPackV1> {
  return compileRulePack<PaiColombiaPackV1>(input, "CO", catalog);
}
