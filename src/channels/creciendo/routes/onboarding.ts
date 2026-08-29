import { createHash } from "node:crypto";

import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import type { SupabaseBearerToken } from "../../../../agent/lib/supabase/types";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import {
  ONBOARDING_ERROR_CODES,
  ONBOARDING_REQUEST_SCHEMA,
  ONBOARDING_RESPONSE_SCHEMA,
  type OnboardingErrorCode,
  type OnboardingRequest,
  type OnboardingResponse,
} from "../onboarding-contract";

type StoredResult = Readonly<{ outcome: "created" | "replayed"; response: OnboardingResponse }>;

export interface OnboardingPersistence {
  createOrReplay(input: Readonly<{
    request: OnboardingRequest;
    accessToken: SupabaseBearerToken;
    signal: AbortSignal;
  }>): Promise<StoredResult | Readonly<{ error: OnboardingErrorCode }>>;
}

export type OnboardingRouteDependencies = Readonly<{ persistence: OnboardingPersistence }>;

function safeError(status: number, code: OnboardingErrorCode): Response {
  return Response.json({ contractVersion: "onboarding.v1", status: "error", code }, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function statusFor(code: OnboardingErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "IDEMPOTENCY_CONFLICT":
    case "ONBOARDING_ALREADY_EXISTS": return 409;
    case "SERVICE_UNAVAILABLE": return 503;
    case "INTERNAL_ERROR": return 500;
  }
}

function requestFingerprint(request: OnboardingRequest): string {
  const canonical = JSON.stringify({
    contractVersion: request.contractVersion,
    careSpace: request.careSpace,
    child: request.child,
    guardianRelationship: request.guardianRelationship,
    privacyConsentAccepted: request.privacyConsentAccepted,
  });
  return createHash("sha256").update(`creciendo-onboarding.v1\n${canonical}`, "utf8").digest("hex");
}

export async function handleOnboarding(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: OnboardingRouteDependencies,
): Promise<Response> {
  if (request.signal.aborted) return safeError(503, "SERVICE_UNAVAILABLE");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return safeError(400, "INVALID_REQUEST");
  }
  const parsed = ONBOARDING_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeError(400, "INVALID_REQUEST");
  const idempotencyHeader = request.headers.get("Idempotency-Key");
  if (idempotencyHeader !== null && idempotencyHeader !== parsed.data.idempotencyKey) return safeError(400, "INVALID_REQUEST");
  try {
    const stored = await dependencies.persistence.createOrReplay({
      request: parsed.data,
      accessToken: auth.guardian.bearerToken,
      signal: request.signal,
    });
    if ("error" in stored) return safeError(statusFor(stored.error), stored.error);
    const validated = ONBOARDING_RESPONSE_SCHEMA.safeParse(stored.response);
    if (!validated.success) return safeError(503, "SERVICE_UNAVAILABLE");
    return Response.json(validated.data, {
      status: stored.outcome === "created" ? 201 : 200,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return safeError(503, "SERVICE_UNAVAILABLE");
  }
}

function mapPersistenceError(message: string): OnboardingErrorCode {
  if (message.includes("onboarding_idempotency_conflict")) return "IDEMPOTENCY_CONFLICT";
  if (message.includes("onboarding_already_exists")) return "ONBOARDING_ALREADY_EXISTS";
  if (message.includes("onboarding_consent_definition_unavailable")) return "SERVICE_UNAVAILABLE";
  if (message.includes("not_authenticated")) return "UNAUTHORIZED";
  return "SERVICE_UNAVAILABLE";
}

export function createRpcOnboardingPersistence(
  config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">,
): OnboardingPersistence {
  return {
    async createOrReplay(input) {
      if (input.signal.aborted) return { error: "SERVICE_UNAVAILABLE" };
      try {
        const client = createRequestSupabaseClient({ config, accessToken: input.accessToken });
        const result = await client.rpc("create_onboarding" as never, {
          p_request_sha256: requestFingerprint(input.request),
          p_idempotency_key: input.request.idempotencyKey,
          p_care_space_name: input.request.careSpace.name,
          p_given_names: input.request.child.givenNames,
          p_birth_date: input.request.child.birthDate,
          p_reference_sex: input.request.child.referenceSex,
          p_country_of_care: input.request.child.countryOfCare,
          p_timezone: input.request.child.timezone,
          p_is_premature: input.request.child.isPremature,
          p_gestational_age_weeks: input.request.child.gestationalAgeWeeks,
          p_allergies: input.request.child.allergies,
          p_guardian_relationship: input.request.guardianRelationship,
          p_consent_type: "privacy",
          p_consent_jurisdiction: input.request.child.countryOfCare,
          p_consent_locale: input.request.child.countryOfCare === "CO" ? "es-CO" : "en-US",
          p_family_names: input.request.child.familyNames,
          p_preferred_name: input.request.child.preferredName,
          p_time_of_birth: input.request.child.timeOfBirth,
          p_birth_time_zone: input.request.child.birthTimeZone,
          p_gestational_age_days: input.request.child.gestationalAgeDays,
          p_birth_weight_grams: input.request.child.birthWeightGrams,
        } as never);
        if (result.error) return { error: mapPersistenceError(result.error.message) };
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!row || typeof row !== "object") return { error: "SERVICE_UNAVAILABLE" };
        const value = row as Record<string, unknown>;
        const response = ONBOARDING_RESPONSE_SCHEMA.safeParse({
          contractVersion: "onboarding.v1",
          status: "created",
          careSpaceId: value.care_space_id,
          childId: value.child_id,
          resourceVersion: value.resource_version,
        });
        if (!response.success) return { error: "SERVICE_UNAVAILABLE" };
        return { outcome: value.outcome === "replayed" ? "replayed" as const : "created" as const, response: response.data };
      } catch {
        return { error: "SERVICE_UNAVAILABLE" };
      }
    },
  };
}

export const ONBOARDING_PUBLIC_ERROR_CODES = ONBOARDING_ERROR_CODES;
