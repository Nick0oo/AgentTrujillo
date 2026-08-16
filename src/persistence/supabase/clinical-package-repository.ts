import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import type { ClinicalPackageRepository, ClinicalPackageQuery } from "../../clinical/governance/package-repository.ts";

export function createClinicalPackageRepository(client: SupabaseClient<Database>): ClinicalPackageRepository {
  return Object.freeze({
    async findCandidates(query: ClinicalPackageQuery) {
      const { data, error } = await client.from("clinical_rule_packs").select("*")
        .eq("domain", query.domain).eq("country_code", query.countryCode).eq("locale", query.locale).eq("status", "active");
      if (error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      // Release/source/approval joins are deliberately not fabricated until AT-03-09 is applied.
      return (data ?? []).map(() => { throw new Error("PACKAGE_REPOSITORY_REQUIRES_GOVERNANCE_SNAPSHOT"); });
    },
  });
}
