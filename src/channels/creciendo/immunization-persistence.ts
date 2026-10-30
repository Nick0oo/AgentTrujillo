import { createHash, randomUUID } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { RuntimeConfig } from "../../../agent/lib/config/env.ts";
import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client.ts";
import type { AuthenticatedChannelRequest } from "./auth-middleware.ts";
import { createClinicalPackageRepository } from "../../persistence/supabase/clinical-package-repository.ts";
import { createImmunizationRepository } from "../../persistence/supabase/immunization-repository.ts";
import { buildAdministrationConfirmationSnapshot } from "../../clinical/immunization/evidence.ts";
import { parseCalendarDate } from "../../clinical/immunization/calendar.ts";
import { resolveVaccineProduct } from "../../clinical/immunization/registry.ts";
import { validateAdministration } from "../../clinical/immunization/validation.ts";
import type { AdministrationDraft, AdministrationScope, VaccineCatalog, VaccineEvidence, VaccineProductIdentity } from "../../clinical/immunization/types.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";
import type { ClinicalPackageCandidate } from "../../clinical/governance/package-repository.ts";
import type { ImmunizationAdministrationCommand } from "./routes/immunization-administration.ts";
import type { ImmunizationAdministrationDraftCommand } from "./routes/immunization-administration-draft.ts";
import type { ImmunizationAdministrationRequest } from "./immunization-contract.ts";
import { CRECIENDO_IMMUNIZATION_VERSION } from "./immunization-contract.ts";
import { CRECIENDO_IMMUNIZATION_DRAFT_VERSION, type ImmunizationAdministrationDraftRequest } from "./immunization-administration-draft-contract.ts";

const DRAFT_SOURCE_ID = "guardian-declaration";
const DRAFT_TTL_MS = 5 * 60 * 1000;
const HASH = /^[a-f0-9]{64}$/u;

type Client = ReturnType<typeof createRequestSupabaseClient>;
// The optional draft migration is not active in Cloud. Keep its existing
// fail-closed boundary separate from the authoritative generated live schema.
type AdministrationRow = import("../../persistence/supabase/database.types.ts").Database["public"]["Tables"]["vaccine_administrations"]["Row"] & { draft_expires_at?: string | null };

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return parseCalendarDate(`${values.get("year")}-${values.get("month")}-${values.get("day")}`);
}

function validHash(value: string | null): value is Sha256Hex { return typeof value === "string" && HASH.test(value); }

function catalogFromRows(products: readonly Record<string, unknown>[], antigens: readonly Record<string, unknown>[], links: readonly Record<string, unknown>[]): VaccineCatalog | null {
  const productRows = products.filter((row) => typeof row.id === "string" && typeof row.product_code === "string" && (row.country_code === "CO" || row.country_code === "US" || row.country_code === "GLOBAL") && typeof row.catalog_version === "string" && typeof row.source_digest === "string" && typeof row.effective_from === "string");
  const antigenRows = antigens.filter((row) => typeof row.id === "string" && typeof row.antigen_code === "string" && typeof row.catalog_version === "string" && typeof row.source_digest === "string" && typeof row.effective_from === "string");
  const versions = new Set([...productRows, ...antigenRows].map((row) => row.catalog_version));
  const digests = new Set([...productRows, ...antigenRows].map((row) => row.source_digest));
  const versionValue = [...versions][0];
  const sourceDigestValue = [...digests][0];
  if (typeof versionValue !== "string" || versions.size !== 1 || typeof sourceDigestValue !== "string" || digests.size !== 1 || !validHash(sourceDigestValue)) return null;
  const productsOut: VaccineProductIdentity[] = productRows.map((row) => ({
    id: row.id as VaccineProductIdentity["id"], productCode: row.product_code as string,
    countryCode: row.country_code as VaccineProductIdentity["countryCode"], manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : "",
    brandName: typeof row.brand_name === "string" ? row.brand_name : "", presentation: typeof row.presentation === "string" ? row.presentation : "",
    regulatoryIdentifier: typeof row.regulatory_identifier === "string" ? row.regulatory_identifier : null,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter((value): value is string => typeof value === "string") : [],
    effectiveFrom: row.effective_from as VaccineProductIdentity["effectiveFrom"], effectiveUntil: typeof row.effective_until === "string" ? row.effective_until as VaccineProductIdentity["effectiveUntil"] : null,
    active: row.active === true,
  }));
  return Object.freeze({
    version: versionValue, sourceDigest: sourceDigestValue, products: productsOut,
    antigens: antigenRows.map((row) => ({ id: row.id as never, antigenCode: row.antigen_code as string, displayName: typeof row.display_name_es === "string" ? row.display_name_es : typeof row.display_name_en === "string" ? row.display_name_en : row.antigen_code as string, diseaseGroup: typeof row.disease_group === "string" ? row.disease_group : "", active: row.active === true })),
    productAntigens: links.filter((row) => typeof row.vaccine_product_id === "string" && typeof row.antigen_id === "string").map((row) => ({ productId: row.vaccine_product_id as never, antigenId: row.antigen_id as never })),
  });
}

async function loadCatalog(client: Client, signal: AbortSignal): Promise<VaccineCatalog | null> {
  if (signal.aborted) return null;
  const [products, antigens] = await Promise.all([
    client.from("vaccine_products").select("*").eq("active", true),
    client.from("vaccine_antigens").select("*").eq("active", true),
  ]);
  if (products.error || antigens.error || !Array.isArray(products.data) || !Array.isArray(antigens.data)) return null;
  const productIds = products.data.map((row) => row.id);
  const links = productIds.length === 0 ? { data: [], error: null } : await client.from("vaccine_product_antigens").select("*").in("vaccine_product_id", productIds);
  if (links.error || !Array.isArray(links.data)) return null;
  return catalogFromRows(products.data as unknown as Record<string, unknown>[], antigens.data as unknown as Record<string, unknown>[], links.data as unknown as Record<string, unknown>[]);
}

function scopeFor(scope: AuthorizedChildScope, asOfDate: ReturnType<typeof parseCalendarDate>): AdministrationScope {
  return { careSpaceId: scope.careSpaceId, childId: scope.childId, countryCode: scope.countryOfCare, asOfDate };
}

function declarationQuery(declaration: ImmunizationAdministrationDraftRequest | ImmunizationAdministrationRequest) {
  return declaration.productIdentifier ? { productCode: declaration.productIdentifier } : { alias: declaration.productLabel! };
}

function resultRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data) || typeof data[0] !== "object" || data[0] === null) return null;
  return data[0] as Record<string, unknown>;
}

function draftFingerprint(scope: AuthorizedChildScope, declaration: ImmunizationAdministrationDraftRequest): Sha256Hex {
  return hash({ version: CRECIENDO_IMMUNIZATION_DRAFT_VERSION, scope: { careSpaceId: scope.careSpaceId, childId: scope.childId, country: scope.countryOfCare }, declaration });
}

function administrationFingerprint(scope: AuthorizedChildScope, declaration: ImmunizationAdministrationRequest): Sha256Hex {
  return hash({ version: CRECIENDO_IMMUNIZATION_VERSION, scope: { careSpaceId: scope.careSpaceId, childId: scope.childId, country: scope.countryOfCare }, declaration });
}

function packageSources(candidate: ClinicalPackageCandidate) {
  return candidate.sources.map((source) => ({ label: source.title, referenceCode: source.id ?? source.sourceId ?? "clinical-source", sourceDigest: source.artifactSha256 }));
}

export function createSupabaseImmunizationAdministrationDraftCommand(input: Readonly<{ config: RuntimeConfig; auth: AuthenticatedChannelRequest; now?: () => Date }>): ImmunizationAdministrationDraftCommand {
  const client = createRequestSupabaseClient({ config: input.config, accessToken: input.auth.guardian.bearerToken });
  type CommandInput = Parameters<ImmunizationAdministrationDraftCommand["execute"]>[0];
  return Object.freeze({
    async execute(commandInput: CommandInput) {
      const now = input.now?.() ?? new Date();
      const catalog = await loadCatalog(client, commandInput.signal);
      if (!catalog) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      const resolved = resolveVaccineProduct(declarationQuery(commandInput.declaration), catalog, commandInput.scope.countryOfCare, commandInput.declaration.administeredOn);
      if (resolved.outcome !== "resolved" || !resolved.product) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      const asOfDate = localDate(now, commandInput.scope.timezone);
      const administrationScope = scopeFor(commandInput.scope, asOfDate);
      const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS).toISOString();
      const evidence: VaccineEvidence = { sourceType: "guardian", sourceId: DRAFT_SOURCE_ID, sourceDigest: hash({ sourceType: "guardian", sourceId: DRAFT_SOURCE_ID, scope: administrationScope, declaration: commandInput.declaration }), extractedAt: now.toISOString(), observedScope: { childId: commandInput.scope.childId, countryCode: commandInput.scope.countryOfCare }, expiresAt };
      const extracted = { administeredOn: parseCalendarDate(commandInput.declaration.administeredOn), product: { productCode: resolved.product.productCode }, ...(commandInput.declaration.doseLabel ? { doseLabel: commandInput.declaration.doseLabel } : {}), ...(commandInput.declaration.lotNumber ? { lotNumber: commandInput.declaration.lotNumber } : {}), ...(commandInput.declaration.location ? { administrationSite: commandInput.declaration.location } : {}), provenanceType: "guardian" as const };
      const draftId = randomUUID();
      const draft = { draftId, scope: administrationScope, evidence, extracted, confirmationDigest: hash({ scope: administrationScope, evidence, extracted, expiresAt }), expiresAt } as AdministrationDraft;
      const { data, error } = await client.rpc("create_vaccine_administration_draft" as never, {
        p_care_space_id: commandInput.scope.careSpaceId, p_child_id: commandInput.scope.childId, p_vaccine_product_id: resolved.product.id,
        p_administered_on: commandInput.declaration.administeredOn, p_dose_label: commandInput.declaration.doseLabel ?? null, p_lot_number: commandInput.declaration.lotNumber ?? null, p_administration_site: commandInput.declaration.location ?? null,
        p_country_code: commandInput.scope.countryOfCare, p_provenance_type: "guardian", p_source_digest: evidence.sourceDigest,
        p_confirmation_sha256: draft.confirmationDigest, p_input_fingerprint: draftFingerprint(commandInput.scope, commandInput.declaration),
        p_idempotency_key: commandInput.idempotencyKey, p_draft_expires_at: expiresAt, p_catalog_version: catalog.version, p_catalog_digest: catalog.sourceDigest,
      } as never);
      if (error) return { code: error.code === "23505" ? "IDEMPOTENCY_CONFLICT" as const : "PERSISTENCE_UNAVAILABLE" as const };
      const row = resultRow(data);
      if (!row || typeof row.draft_id !== "string" || (row.outcome !== "created" && row.outcome !== "idempotent_replay") || typeof row.draft_expires_at !== "string" || !Number.isFinite(Date.parse(row.draft_expires_at))) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      return { response: { version: CRECIENDO_IMMUNIZATION_DRAFT_VERSION, requestId: commandInput.requestId, outcome: row.outcome as "created" | "idempotent_replay", draftId: row.draft_id, expiresAt: row.draft_expires_at, confirmationRequired: true as const } };
    },
  });
}

export function createSupabaseImmunizationAdministrationCommand(input: Readonly<{ config: RuntimeConfig; auth: AuthenticatedChannelRequest; now?: () => Date }>): ImmunizationAdministrationCommand {
  const client = createRequestSupabaseClient({ config: input.config, accessToken: input.auth.guardian.bearerToken });
  const repository = createImmunizationRepository(client);
  const packages = createClinicalPackageRepository(client);
  type CommandInput = Parameters<ImmunizationAdministrationCommand["execute"]>[0];
  return Object.freeze({
    async execute(commandInput: CommandInput) {
      const now = input.now?.() ?? new Date();
      const { data: draftData, error: draftError } = await client.from("vaccine_administrations").select("*").eq("id", commandInput.declaration.evidenceDraftId).eq("care_space_id", commandInput.scope.careSpaceId).eq("child_id", commandInput.scope.childId).eq("recorded_by", commandInput.scope.actorUserId).maybeSingle();
      const row = draftData as AdministrationRow | null;
      if (draftError) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      if (!row || row.confirmation_status !== "draft" || !row.draft_expires_at || !validHash(row.source_digest) || !validHash(row.confirmation_sha256) || !row.vaccine_product_id || !row.created_at) return { code: "NOT_FOUND" as const };
      const asOfDate = localDate(new Date(row.created_at), commandInput.scope.timezone);
      const administrationScope = scopeFor(commandInput.scope, asOfDate);
      const catalog = await loadCatalog(client, commandInput.signal);
      if (!catalog) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      const product = catalog.products.find((candidate) => candidate.id === row.vaccine_product_id);
      if (!product) return { code: "CONFIRMATION_INVALID" as const };
      const evidence: VaccineEvidence = { sourceType: "guardian", sourceId: DRAFT_SOURCE_ID, sourceDigest: row.source_digest, extractedAt: row.created_at, observedScope: { childId: commandInput.scope.childId, countryCode: commandInput.scope.countryOfCare }, expiresAt: row.draft_expires_at };
      const extracted = { administeredOn: parseCalendarDate(row.administered_on), product: { productCode: product.productCode }, ...(row.dose_label ? { doseLabel: row.dose_label } : {}), ...(row.lot_number ? { lotNumber: row.lot_number } : {}), ...(row.administration_site ? { administrationSite: row.administration_site } : {}), provenanceType: "guardian" as const };
      let snapshot;
      try {
        snapshot = buildAdministrationConfirmationSnapshot({ draftId: row.id, scope: administrationScope, evidence, extracted, confirmationDigest: row.confirmation_sha256, expiresAt: row.draft_expires_at });
      } catch {
        return { code: "CONFIRMATION_INVALID" as const };
      }
      const child = await client.from("children").select("date_of_birth").eq("id", commandInput.scope.childId).eq("care_space_id", commandInput.scope.careSpaceId).maybeSingle();
      if (child.error || !child.data || typeof child.data.date_of_birth !== "string") return { code: "PERSISTENCE_UNAVAILABLE" as const };
      const validation = validateAdministration(snapshot, { now: now.toISOString(), dateOfBirth: child.data.date_of_birth, expectedScope: administrationScope, expectedConfirmationDigest: row.confirmation_sha256 }, catalog, { requireResolvedProduct: true });
      if (validation.outcome !== "valid" || !validation.candidate) return { code: "CONFIRMATION_INVALID" as const };
      const candidates = await packages.findCandidates({ domain: "immunization", countryCode: commandInput.scope.countryOfCare, locale: commandInput.scope.countryOfCare === "CO" ? "es-CO" : "en-US", referenceDate: asOfDate, artifactSchemaVersion: "1" }, commandInput.signal);
      const candidate = candidates.find((item) => item.pack.effectiveFrom <= asOfDate && (item.pack.effectiveUntil === null || asOfDate <= item.pack.effectiveUntil));
      if (!candidate) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      const persisted = await repository.recordConfirmed(commandInput.scope, { candidate: validation.candidate, idempotencyKey: commandInput.idempotencyKey, inputFingerprint: administrationFingerprint(commandInput.scope, commandInput.declaration), requestId: commandInput.requestId }, commandInput.signal);
      if ("ok" in persisted && persisted.ok === false) return { code: persisted.code === "IDEMPOTENCY_CONFLICT" ? "IDEMPOTENCY_CONFLICT" as const : persisted.code === "CONFIRMATION_INVALID" ? "CONFIRMATION_INVALID" as const : "PERSISTENCE_UNAVAILABLE" as const };
      if (!("outcome" in persisted)) return { code: "PERSISTENCE_UNAVAILABLE" as const };
      return { response: { version: CRECIENDO_IMMUNIZATION_VERSION, requestId: commandInput.requestId, outcome: persisted.outcome, administeredOn: validation.candidate.administeredOn, country: commandInput.scope.countryOfCare, productCode: validation.candidate.product?.productCode ?? product.productCode, packageVersion: candidate.pack.version, algorithmId: candidate.algorithm.identity.key, assessments: [], sources: packageSources(candidate) } };
    },
  });
}
