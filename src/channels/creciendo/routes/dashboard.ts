import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import { DASHBOARD_RESPONSE_SCHEMA, DASHBOARD_VERSION, type DashboardResponse } from "../directory-contract";

type DashboardData = Readonly<{
  childId: string;
  displayName: string;
  birthDate: string;
  countryOfCare: "CO" | "US";
  timeZone: string;
  lastWeightKg: number | null;
  lastHeightCm: number | null;
  measuredAt: string | null;
  pendingCount: number | null;
  nextDueDate: string | null;
  activePlanCount: number | null;
  recentObservationCount: number | null;
  stageLabel: string | null;
}>;

export interface DashboardResolver {
  resolve(input: Readonly<{ auth: AuthenticatedChannelRequest; childId: string; careSpaceId: string; signal: AbortSignal }>): Promise<DashboardData | null>;
}

function responseError(status: 400 | 403 | 503): Response {
  const code = status === 400 ? "REQUEST_INVALID" : status === 403 ? "ACCESS_DENIED" : "PERSISTENCE_UNAVAILABLE";
  return Response.json({ version: "creciendo.error.v1", code, retryable: status === 503, retryAfterSeconds: null, effectState: "none", resumable: false }, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export async function handleDashboard(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: Readonly<{ tokens: ChildContextTokenService; authorizeChild: AuthorizeChildService; resolver: DashboardResolver; now?: () => Date }>,
): Promise<Response> {
  if (request.signal.aborted) return responseError(503);
  const token = request.headers.get("x-child-context");
  if (!token || token.length > 4096) return responseError(403);
  const claims = await dependencies.tokens.verify(token, auth.guardian, dependencies.now?.() ?? new Date());
  if (!("childId" in claims)) return responseError(403);
  const scope = await dependencies.authorizeChild.authorize({
    guardian: auth.guardian,
    requestedChildId: claims.childId,
    requiredPermissions: ["read"],
    requestId: auth.requestId,
    now: dependencies.now?.() ?? new Date(),
  });
  if (!("childId" in scope) || scope.careSpaceId !== claims.careSpaceId || scope.childId !== claims.childId) return responseError(403);
  try {
    const data = await dependencies.resolver.resolve({ auth, childId: scope.childId, careSpaceId: scope.careSpaceId, signal: request.signal });
    if (!data || request.signal.aborted) return responseError(503);
    const payload: DashboardResponse = DASHBOARD_RESPONSE_SCHEMA.parse({
      version: DASHBOARD_VERSION,
      requestId: auth.requestId,
      scopeVersion: "authorized-child-scope.v1",
      child: { childId: data.childId, displayName: data.displayName, birthDate: data.birthDate, countryOfCare: data.countryOfCare, timeZone: data.timeZone },
      nextActions: [],
      growth: { lastWeightKg: data.lastWeightKg, lastHeightCm: data.lastHeightCm, measuredAt: data.measuredAt },
      immunization: { pendingCount: data.pendingCount, nextDueDate: data.nextDueDate },
      medication: { activePlanCount: data.activePlanCount },
      development: { recentObservationCount: data.recentObservationCount },
      nutrition: { stageLabel: data.stageLabel },
      generatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    });
    return Response.json(payload, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return responseError(503);
  }
}

async function count(client: ReturnType<typeof createRequestSupabaseClient>, table: "vaccination_assessments" | "medication_plans" | "development_observations", childId: string, careSpaceId: string, filters: Array<[string, string]>): Promise<number | null> {
  let query = client.from(table).select("id", { count: "exact", head: true }).eq("child_id", childId).eq("care_space_id", careSpaceId);
  for (const [column, value] of filters) query = query.eq(column, value) as typeof query;
  const result = await query;
  return result.error || typeof result.count !== "number" ? null : result.count;
}

function createProductionResolver(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): DashboardResolver {
  return {
    async resolve({ auth, childId, careSpaceId, signal }) {
      if (!validUuid(childId) || !validUuid(careSpaceId) || signal.aborted) return null;
      const client = createRequestSupabaseClient({ config, accessToken: auth.guardian.bearerToken });
      const childResult = await client.from("children")
        .select("id, care_space_id, preferred_name, given_names, date_of_birth, country_of_care, time_zone, status")
        .eq("id", childId).eq("care_space_id", careSpaceId).eq("status", "active").maybeSingle();
      if (childResult.error || !childResult.data || signal.aborted) return null;
      const child = childResult.data as unknown as Record<string, unknown>;
      const displayName = typeof child.preferred_name === "string" && child.preferred_name.trim() ? child.preferred_name.trim() : child.given_names;
      if (typeof displayName !== "string" || typeof child.date_of_birth !== "string" || (child.country_of_care !== "CO" && child.country_of_care !== "US") || typeof child.time_zone !== "string") return null;
      const [weight, height, pendingCount, activePlanCount, recentObservationCount, nutrition] = await Promise.all([
        client.from("anthropometric_measurements").select("normalized_value, occurred_at").eq("child_id", childId).eq("care_space_id", careSpaceId).eq("measurement_type", "weight").eq("validation_status", "confirmed").order("occurred_at", { ascending: false }).limit(1),
        client.from("anthropometric_measurements").select("normalized_value, occurred_at").eq("child_id", childId).eq("care_space_id", careSpaceId).in("measurement_type", ["recumbent_length", "standing_height"]).eq("validation_status", "confirmed").order("occurred_at", { ascending: false }).limit(1),
        count(client, "vaccination_assessments", childId, careSpaceId, [["status", "due"]]),
        count(client, "medication_plans", childId, careSpaceId, [["status", "active"]]),
        count(client, "development_observations", childId, careSpaceId, [["status", "observed"]]),
        client.from("nutrition_profiles").select("texture_stage").eq("child_id", childId).eq("care_space_id", careSpaceId).maybeSingle(),
      ]);
      const weightRow = Array.isArray(weight.data) ? weight.data[0] as Record<string, unknown> | undefined : undefined;
      const heightRow = Array.isArray(height.data) ? height.data[0] as Record<string, unknown> | undefined : undefined;
      if (weight.error || height.error || nutrition.error) return null;
      return {
        childId,
        displayName,
        birthDate: child.date_of_birth,
        countryOfCare: child.country_of_care,
        timeZone: child.time_zone,
        lastWeightKg: typeof weightRow?.normalized_value === "number" ? weightRow.normalized_value : null,
        lastHeightCm: typeof heightRow?.normalized_value === "number" ? heightRow.normalized_value : null,
        measuredAt: typeof weightRow?.occurred_at === "string" ? weightRow.occurred_at : typeof heightRow?.occurred_at === "string" ? heightRow.occurred_at : null,
        pendingCount,
        nextDueDate: null,
        activePlanCount,
        recentObservationCount,
        stageLabel: typeof (nutrition.data as unknown as Record<string, unknown> | null)?.texture_stage === "string" ? (nutrition.data as unknown as Record<string, unknown>).texture_stage as string : null,
      };
    },
  };
}

export function createDashboardRouteDependencies(config: RuntimeConfig): Readonly<{ tokens: ChildContextTokenService; authorizeChild: AuthorizeChildService; resolver: DashboardResolver }> {
  return Object.freeze({
    tokens: createChildContextTokenService(config),
    authorizeChild: createAuthorizeChildService(config),
    resolver: createProductionResolver(config),
  });
}
