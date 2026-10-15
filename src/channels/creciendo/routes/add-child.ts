import { createHash } from "node:crypto";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import type { SupabaseBearerToken } from "../../../../agent/lib/supabase/types";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import { ADD_CHILD_ERROR_CODES, ADD_CHILD_REQUEST_SCHEMA, ADD_CHILD_RESPONSE_SCHEMA, type AddChildErrorCode, type AddChildRequest, type AddChildResponse } from "../add-child-contract";

type StoredResult = Readonly<{ outcome: "created" | "replayed"; response: AddChildResponse }>;
export interface AddChildPersistence { createOrReplay(input: Readonly<{ request: AddChildRequest; accessToken: SupabaseBearerToken; signal: AbortSignal }>): Promise<StoredResult | Readonly<{ error: AddChildErrorCode }>>; }
export type AddChildRouteDependencies = Readonly<{ persistence: AddChildPersistence }>;

function safeError(status: number, code: AddChildErrorCode): Response { return Response.json({ contractVersion: "add-child.v1", status: "error", code }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function statusFor(code: AddChildErrorCode): number { switch (code) { case "INVALID_REQUEST": return 400; case "UNAUTHORIZED": return 401; case "FORBIDDEN": return 403; case "IDEMPOTENCY_CONFLICT": return 409; case "CONSENT_REQUIRED": return 409; case "SERVICE_UNAVAILABLE": return 503; case "INTERNAL_ERROR": return 500; } }
function fingerprint(request: AddChildRequest): string { return createHash("sha256").update(`creciendo-add-child.v1\n${JSON.stringify({ careSpaceId: request.careSpaceId, child: request.child, privacyConsentAccepted: request.privacyConsentAccepted })}`, "utf8").digest("hex"); }

export async function handleAddChild(request: Request, auth: AuthenticatedChannelRequest, dependencies: AddChildRouteDependencies): Promise<Response> {
  if (request.signal.aborted) return safeError(503, "SERVICE_UNAVAILABLE");
  let raw: unknown; try { raw = await request.json(); } catch { return safeError(400, "INVALID_REQUEST"); }
  const parsed = ADD_CHILD_REQUEST_SCHEMA.safeParse(raw); if (!parsed.success) return safeError(400, "INVALID_REQUEST");
  const idempotencyHeader = request.headers.get("Idempotency-Key"); if (idempotencyHeader !== null && idempotencyHeader !== parsed.data.idempotencyKey) return safeError(400, "INVALID_REQUEST");
  try {
    const stored = await dependencies.persistence.createOrReplay({ request: parsed.data, accessToken: auth.guardian.bearerToken, signal: request.signal });
    if ("error" in stored) return safeError(statusFor(stored.error), stored.error);
    const validated = ADD_CHILD_RESPONSE_SCHEMA.safeParse(stored.response); if (!validated.success) return safeError(503, "SERVICE_UNAVAILABLE");
    return Response.json(validated.data, { status: stored.outcome === "created" ? 201 : 200, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return safeError(503, "SERVICE_UNAVAILABLE"); }
}

export function mapAddChildPersistenceError(message: string): AddChildErrorCode {
  if (message.includes("add_child_idempotency_conflict")) return "IDEMPOTENCY_CONFLICT";
  if (message.includes("add_child_forbidden")) return "FORBIDDEN";
  if (message.includes("add_child_consent_required")) return "CONSENT_REQUIRED";
  if (message.includes("not_authenticated")) return "UNAUTHORIZED";
  if (message.includes("add_child_request_invalid") || message.includes("children_birth_weight_grams_check")) return "INVALID_REQUEST";
  return "SERVICE_UNAVAILABLE";
}

export function createRpcAddChildPersistence(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): AddChildPersistence {
  return { async createOrReplay(input) {
    if (input.signal.aborted) return { error: "SERVICE_UNAVAILABLE" };
    try {
      const request = input.request; const child = request.child; const client = createRequestSupabaseClient({ config, accessToken: input.accessToken });
      const result = await client.rpc("create_child_in_care_space" as never, {
        p_request_sha256: fingerprint(request), p_idempotency_key: request.idempotencyKey, p_care_space_id: request.careSpaceId,
        p_given_names: child.givenNames, p_family_names: child.familyNames, p_preferred_name: child.preferredName,
        p_birth_date: child.birthDate, p_time_of_birth: child.timeOfBirth, p_birth_time_zone: child.birthTimeZone,
        p_reference_sex: child.referenceSex, p_country_of_care: child.countryOfCare, p_timezone: child.timezone,
        p_is_premature: child.isPremature, p_gestational_age_weeks: child.gestationalAgeWeeks,
        p_gestational_age_days: child.gestationalAgeDays, p_birth_weight_grams: child.birthWeightGrams, p_allergies: child.allergies,
      } as never);
      if (result.error) return { error: mapAddChildPersistenceError(result.error.message) };
      const row = (Array.isArray(result.data) ? result.data[0] : result.data) as Record<string, unknown> | undefined;
      if (!row) return { error: "SERVICE_UNAVAILABLE" };
      const response = ADD_CHILD_RESPONSE_SCHEMA.safeParse({ contractVersion: "add-child.v1", status: "created", careSpaceId: row.care_space_id, childId: row.child_id, resourceVersion: row.resource_version });
      if (!response.success) return { error: "SERVICE_UNAVAILABLE" };
      return { outcome: row.outcome === "replayed" ? "replayed" as const : "created" as const, response: response.data };
    } catch { return { error: "SERVICE_UNAVAILABLE" }; }
  } };
}

export const ADD_CHILD_PUBLIC_ERROR_CODES = ADD_CHILD_ERROR_CODES;
