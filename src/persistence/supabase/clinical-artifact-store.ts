import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import type { PrivilegedJobScope } from "../../../agent/lib/supabase/privileged-job-scope.ts";
import { verifyArtifactBytes, type VerifiedRulePackArtifact, ChecksumError } from "../../clinical/governance/checksum.ts";
import {
  CLINICAL_ARTIFACT_MAX_BYTES,
  CLINICAL_SOURCES_BUCKET,
  clinicalArtifactPath,
  ClinicalArtifactStoreError,
  type ClinicalArtifactLocation,
  type ClinicalArtifactStore,
} from "../../clinical/governance/artifact-store.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";

type PrivilegedSupabaseClient = SupabaseClient<Database>;
const CLINICAL_JOB_NAME = "clinical-artifact-storage";

function assertScope(scope: PrivilegedJobScope, signal?: AbortSignal): void {
  if (scope.jobName !== CLINICAL_JOB_NAME || !scope.invocationId || scope.expiresAt.getTime() <= Date.now() || signal?.aborted) {
    throw new ClinicalArtifactStoreError("STORAGE_UNAVAILABLE");
  }
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : "statusCode" in error ? error.statusCode : undefined;
  return status === 409 || status === "409" || ("message" in error && /already exists|duplicate/i.test(String(error.message)));
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : "statusCode" in error ? error.statusCode : undefined;
  return status === 404 || status === "404";
}

function locationFor<T>(artifact: VerifiedRulePackArtifact<T>): ClinicalArtifactLocation {
  const { domain, countryCode } = artifact.artifact.header;
  return { bucket: CLINICAL_SOURCES_BUCKET, path: clinicalArtifactPath(domain, countryCode, artifact.digest), artifactSha256: artifact.digest };
}

async function downloadVerified<T>(client: PrivilegedSupabaseClient, location: ClinicalArtifactLocation, expectedDigest: Sha256Hex, signal?: AbortSignal): Promise<VerifiedRulePackArtifact<T>> {
  if (signal?.aborted) throw new ClinicalArtifactStoreError("STORAGE_UNAVAILABLE");
  const result = await client.storage.from(CLINICAL_SOURCES_BUCKET).download(location.path);
  if (result.error) {
    if (isMissing(result.error)) throw new ClinicalArtifactStoreError("OBJECT_MISSING");
    throw new ClinicalArtifactStoreError("STORAGE_UNAVAILABLE");
  }
  if (!result.data) throw new ClinicalArtifactStoreError("STORAGE_UNAVAILABLE");
  const bytes = new Uint8Array(await result.data.arrayBuffer());
  if (bytes.byteLength > CLINICAL_ARTIFACT_MAX_BYTES) throw new ClinicalArtifactStoreError("CONTENT_INVALID");
  try {
    return verifyArtifactBytes<T>(bytes, expectedDigest);
  } catch (error) {
    if (error instanceof ChecksumError) throw new ClinicalArtifactStoreError("CONTENT_INVALID");
    throw new ClinicalArtifactStoreError("CONTENT_INVALID");
  }
}

export function createClinicalArtifactStore(client: PrivilegedSupabaseClient): ClinicalArtifactStore {
  const store: ClinicalArtifactStore = {
    async putVerifiedArtifact<T>(scope: PrivilegedJobScope, artifact: VerifiedRulePackArtifact<T>, signal?: AbortSignal) {
      assertScope(scope, signal);
      if (artifact.bytes.byteLength > CLINICAL_ARTIFACT_MAX_BYTES) throw new ClinicalArtifactStoreError("CONTENT_INVALID");
      const location = locationFor(artifact);
      const storage = client.storage.from(CLINICAL_SOURCES_BUCKET);
      const upload = await storage.upload(location.path, artifact.bytes, {
        contentType: "application/json",
        cacheControl: "31536000, immutable",
        upsert: false,
      });
      if (upload.error && !isConflict(upload.error)) throw new ClinicalArtifactStoreError("STORAGE_UNAVAILABLE");
      if (upload.error && isConflict(upload.error)) {
        let existing: VerifiedRulePackArtifact<T>;
        try {
          existing = await downloadVerified<T>(client, location, artifact.digest, signal);
        } catch (error) {
          if (error instanceof ClinicalArtifactStoreError && error.code === "CONTENT_INVALID") throw new ClinicalArtifactStoreError("OBJECT_CONFLICT");
          throw error;
        }
        if (existing.digest !== artifact.digest) throw new ClinicalArtifactStoreError("OBJECT_CONFLICT");
        return location;
      }
      await downloadVerified<T>(client, location, artifact.digest, signal);
      return location;
    },
    async getVerifiedArtifact<T>(scope: PrivilegedJobScope, location: ClinicalArtifactLocation, expectedDigest: Sha256Hex, signal?: AbortSignal) {
      assertScope(scope, signal);
      if (location.bucket !== CLINICAL_SOURCES_BUCKET || location.artifactSha256 !== expectedDigest
        || !new RegExp(`^v1/(growth|immunization|medication|development|nutrition|emergency)/(CO|US|GLOBAL)/${expectedDigest}\\.json$`).test(location.path)) throw new ClinicalArtifactStoreError("CONTENT_INVALID");
      return downloadVerified<T>(client, location, expectedDigest, signal);
    },
  };
  return Object.freeze(store);
}
