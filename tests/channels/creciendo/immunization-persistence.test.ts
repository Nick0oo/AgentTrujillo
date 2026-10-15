import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../agent/lib/supabase/request-client.ts", () => ({ createRequestSupabaseClient: vi.fn() }));
vi.mock("../../../src/persistence/supabase/immunization-repository.ts", () => ({ createImmunizationRepository: vi.fn() }));
vi.mock("../../../src/persistence/supabase/clinical-package-repository.ts", () => ({ createClinicalPackageRepository: vi.fn() }));
vi.mock("../../../src/clinical/immunization/evidence.ts", () => ({ buildAdministrationConfirmationSnapshot: vi.fn(() => ({})) }));
vi.mock("../../../src/clinical/immunization/validation.ts", () => ({ validateAdministration: vi.fn() }));

import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client.ts";
import { createImmunizationRepository } from "../../../src/persistence/supabase/immunization-repository.ts";
import { createClinicalPackageRepository } from "../../../src/persistence/supabase/clinical-package-repository.ts";
import { validateAdministration } from "../../../src/clinical/immunization/validation.ts";
import { createSupabaseImmunizationAdministrationCommand, createSupabaseImmunizationAdministrationDraftCommand } from "../../../src/channels/creciendo/immunization-persistence.ts";

const actorUserId = "10000000-0000-4000-8000-000000000001";
const careSpaceId = "20000000-0000-4000-8000-000000000001";
const childId = "30000000-0000-4000-8000-000000000001";
const productId = "40000000-0000-4000-8000-000000000001";
const antigenId = "50000000-0000-4000-8000-000000000001";
const digest = "a".repeat(64);
const now = new Date("2026-09-02T12:00:00.000Z");
const requestId = "request-immunization-1";
const scope = {
  actorUserId, careSpaceId, childId, permissions: ["read", "record"], countryOfCare: "CO" as const,
  timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-09-02T11:55:00.000Z"), expiresAt: new Date("2026-09-02T12:05:00.000Z"),
} as never;
const auth = { requestId, guardian: { userId: actorUserId, bearerToken: "token" } } as never;

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function client() {
  const draftRow = {
    id: "60000000-0000-4000-8000-000000000001", confirmation_status: "draft", care_space_id: careSpaceId, child_id: childId,
    recorded_by: actorUserId, vaccine_product_id: productId, administered_on: "2026-08-01", administration_site: "Centro",
    source_digest: digest, confirmation_sha256: digest, draft_expires_at: "2026-09-02T12:05:00.000Z", created_at: "2026-09-02T12:00:00.000Z",
  };
  const product = { id: productId, product_code: "BCG", country_code: "CO", active: true, catalog_version: "catalog-1", source_digest: digest, effective_from: "2025-01-01", effective_until: null, aliases: [], manufacturer: null, brand_name: null, presentation: null, regulatory_identifier: null };
  const antigen = { id: antigenId, antigen_code: "BCG", display_name_es: "BCG", display_name_en: "BCG", disease_group: "tb", active: true, catalog_version: "catalog-1", source_digest: digest, effective_from: "2025-01-01", effective_until: null };
  const from = vi.fn((table: string) => {
    if (table === "vaccine_administrations") return query(draftRow);
    if (table === "vaccine_products") return query([product]);
    if (table === "vaccine_antigens") return query([antigen]);
    if (table === "vaccine_product_antigens") return query([{ vaccine_product_id: productId, antigen_id: antigenId }]);
    if (table === "children") return query({ date_of_birth: "2025-01-01" });
    return query([]);
  });
  return { from, rpc: vi.fn(async () => ({ data: [{ draft_id: draftRow.id, outcome: "created", draft_expires_at: draftRow.draft_expires_at }], error: null })) };
}

const packageCandidate = {
  pack: { id: "pack-1", domain: "immunization", countryCode: "CO", version: "2026.basic.1", locale: "es-CO", status: "active", effectiveFrom: "2026-01-01", effectiveUntil: null, artifactSha256: digest },
  sources: [{ id: "source-1", title: "Fuente aprobada", artifactSha256: digest }],
  algorithm: { identity: { key: "immunization-basic-informational" } },
};

describe("Creciendo immunization persistence adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createRequestSupabaseClient).mockReturnValue(client() as never);
    vi.mocked(createImmunizationRepository).mockReturnValue({ recordConfirmed: vi.fn(async () => ({ outcome: "created", administrationId: "70000000-0000-4000-8000-000000000001" })) } as never);
    vi.mocked(createClinicalPackageRepository).mockReturnValue({ findCandidates: vi.fn(async () => [packageCandidate]) } as never);
    vi.mocked(validateAdministration).mockReturnValue({ outcome: "valid", reasonCode: "ADMINISTRATION_VALID", candidate: {
      scope, administeredOn: "2026-08-01", product: { id: productId, productCode: "BCG" }, antigenIds: [antigenId], doseLabel: null, lotNumber: null,
      administrationSite: "Centro", providerName: null, catalogVersion: "catalog-1", catalogDigest: digest, provenanceType: "guardian", sourceDigest: digest, confirmationDigest: digest,
    } } as never);
  });

  test("creates a server-persisted draft and returns its opaque id", async () => {
    const command = createSupabaseImmunizationAdministrationDraftCommand({ config: { supabaseUrl: "http://supabase", supabasePublishableKey: "key" } as never, auth, now: () => now });
    const result = await command.execute({ scope, declaration: { version: "creciendo.immunization.draft.v1", administeredOn: "2026-08-01", productIdentifier: "BCG" }, idempotencyKey: `draft_vaccine_administration:${digest}`, requestId, signal: new AbortController().signal });
    expect(result).toMatchObject({ response: { draftId: expect.any(String), outcome: "created" } });
    expect((vi.mocked(createRequestSupabaseClient).mock.results[0]?.value as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("create_vaccine_administration_draft", expect.objectContaining({ p_confirmation_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }));
  });

  test("loads the draft, validates it, and calls the immutable confirmation RPC adapter", async () => {
    const command = createSupabaseImmunizationAdministrationCommand({ config: { supabaseUrl: "http://supabase", supabasePublishableKey: "key" } as never, auth, now: () => now });
    const result = await command.execute({ scope, declaration: { version: "creciendo.immunization.v1", administeredOn: "2026-08-01", productIdentifier: "BCG", evidenceDraftId: "60000000-0000-4000-8000-000000000001", confirmed: true }, idempotencyKey: `record_vaccine_administration:${digest}`, requestId, signal: new AbortController().signal });
    expect(result).toMatchObject({ response: { outcome: "created", productCode: "BCG", country: "CO" } });
    expect(vi.mocked(createImmunizationRepository).mock.results[0]?.value.recordConfirmed).toHaveBeenCalledWith(scope, expect.objectContaining({ idempotencyKey: `record_vaccine_administration:${digest}` }), expect.any(AbortSignal));
  });
});
