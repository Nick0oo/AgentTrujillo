import { compileRulePack, type CompiledRulePack, type PackCompileResult, type RulePackInput } from "./rule-packs.ts";
import type { VaccineCatalog } from "./types.ts";
export { acipUsPackSchema } from "./packs/acip-us-schema.ts";
export type { AcipRuleKind, AcipOfficialStatus } from "./packs/acip-us-schema.ts";

export type AcipUsPackageInput = RulePackInput;
export type AcipUsPackV1 = CompiledRulePack & Readonly<{ countryCode: "US" }>;

export function compileAcipUsPack(input: AcipUsPackageInput, catalog: VaccineCatalog): PackCompileResult<AcipUsPackV1> {
  return compileRulePack<AcipUsPackV1>(input, "US", catalog);
}
