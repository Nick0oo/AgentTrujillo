import { compileRulePack, type CompiledRulePack, type PackCompileResult, type RulePackInput } from "./rule-packs.ts";
import type { VaccineCatalog } from "./types.ts";
export { acipUsPackSchema } from "./packs/acip-us-schema.ts";
export type { AcipRuleKind, AcipOfficialStatus } from "./packs/acip-us-schema.ts";

export type AcipUsPackageInput = RulePackInput & Readonly<{
  officialStatus: Readonly<{ state: "current" | "superseded" | "stayed" | "unknown"; checkedAt: string; sourceReferenceIds: readonly string[] }>;
}>;
export type AcipUsPackV1 = CompiledRulePack & Readonly<{ countryCode: "US" }>;

export function compileAcipUsPack(input: AcipUsPackageInput, catalog: VaccineCatalog): PackCompileResult<AcipUsPackV1> {
  if (input.officialStatus.state !== "current") return { ok: false, issues: ["ACIP_OFFICIAL_STATUS_NOT_CURRENT"] };
  if (!Number.isFinite(Date.parse(input.officialStatus.checkedAt))) return { ok: false, issues: ["ACIP_OFFICIAL_STATUS_CHECK_INVALID"] };
  const sourceIds = new Set(input.sourceReferences.map((source) => source.id));
  if (input.officialStatus.sourceReferenceIds.length === 0 || input.officialStatus.sourceReferenceIds.some((id) => !sourceIds.has(id))) return { ok: false, issues: ["ACIP_OFFICIAL_STATUS_SOURCE_MISSING"] };
  return compileRulePack<AcipUsPackV1>(input, "US", catalog);
}
