import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalize } from "json-canonicalize";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../persistence/supabase/database.types.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { isAuthorizedChildScopeActive } from "../../../agent/lib/access/authorized-child-scope.ts";
import { createClinicalPackageRepository } from "../../persistence/supabase/clinical-package-repository.ts";
import { approvalMatches, exactCandidate, sourceSetDigest } from "../../clinical/governance/package-resolver.ts";
import { clinicalArtifactPath } from "../../clinical/governance/artifact-store.ts";
import { getGrowthPackageArtifact, type GrowthPackageArtifactIdentity } from "../../clinical/anthropometry/packages/growth-package-artifacts.ts";

// Only this provider can issue a package accepted by the summary builder.
const authorizedPackages = new WeakSet<object>();
export type ResolvedGrowthPackage = Readonly<{ identity: GrowthPackageArtifactIdentity; packId: string }>;
export function isResolvedGrowthPackage(value: ResolvedGrowthPackage): boolean { return authorizedPackages.has(value); }

function implementationMatches(identity: GrowthPackageArtifactIdentity): boolean {
  const files = identity.artifact.payload.algorithmFiles.map((file) => ({
    path: file.path,
    sha256: createHash("sha256").update(readFileSync(resolve(process.cwd(), file.path))).digest("hex"),
  }));
  return canonicalize(files) === canonicalize(identity.artifact.payload.algorithmFiles)
    && createHash("sha256").update(canonicalize(files)).digest("hex") === identity.evidence.algorithmImplementationSha256;
}

export function createGrowthPackageProvider(client: SupabaseClient<Database>) {
  const repository = createClinicalPackageRepository(client);
  return Object.freeze({
    async resolve(input: Readonly<{ scope: AuthorizedChildScope; referenceDate: string; signal: AbortSignal }>): Promise<ResolvedGrowthPackage | null> {
      try {
        if (input.signal.aborted || !isAuthorizedChildScopeActive(input.scope) || !/^\d{4}-\d{2}-\d{2}$/u.test(input.referenceDate)) return null;
        const identity = getGrowthPackageArtifact(input.scope.countryOfCare);
        const header = identity.artifact.header;
        const query = { domain: "growth" as const, countryCode: input.scope.countryOfCare, locale: identity.artifact.payload.locale, referenceDate: input.referenceDate, artifactSchemaVersion: "1" };
        const candidates = (await repository.findCandidates(query, input.signal)).filter((candidate) => exactCandidate(candidate, query));
        if (candidates.length !== 1 || input.signal.aborted) return null;
        const candidate = candidates[0];
        const approval = candidate.approval;
        if (!approval || !approvalMatches(approval, candidate)
          || candidate.pack.artifactSha256 !== identity.artifactSha256
          || candidate.pack.version !== header.version || candidate.pack.effectiveFrom !== header.effectiveFrom || candidate.pack.effectiveUntil !== header.effectiveUntil
          || candidate.location.bucket !== "clinical-sources" || candidate.location.path !== clinicalArtifactPath("growth", input.scope.countryOfCare, identity.artifactSha256)
          || candidate.sourceSetSha256 !== identity.evidence.sourceSetSha256 || sourceSetDigest(candidate) !== identity.evidence.sourceSetSha256
          || candidate.sources.some((source) => source.status !== "approved" || (source.jurisdiction !== "GLOBAL" && source.jurisdiction !== input.scope.countryOfCare))
          || candidate.algorithm.status !== "active" || candidate.algorithm.identity.key !== header.algorithm.key
          || candidate.algorithm.identity.version !== header.algorithm.version || !candidate.algorithm.identity.supportedArtifactSchemas.includes("1")
          || candidate.algorithm.identity.implementationSha256 !== identity.evidence.algorithmImplementationSha256
          || candidate.algorithm.identity.testVectorSha256 !== identity.evidence.algorithmTestVectorSha256
          || approval.manifestSha256 !== identity.evidence.manifestSha256
          || (approval.approvalProvenance === "product_owner_conveyed" && approval.conveyanceRecordSha256 !== identity.evidence.conveyanceRecordSha256)
          || !implementationMatches(identity)) return null;
        const resolved = Object.freeze({ identity, packId: candidate.pack.id });
        authorizedPackages.add(resolved);
        return resolved;
      } catch { return null; }
    },
  });
}
