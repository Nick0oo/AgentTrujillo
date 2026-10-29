import type { ChildPermission, AuthorizedChildScope } from "../../../../agent/lib/access/authorized-child-scope";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import { z } from "zod";

export const ANTHROPOMETRY_VERSION = "creciendo.anthropometry.v1" as const;
export const GROWTH_SUMMARY_VERSION = "creciendo.growth-summary.v1" as const;

const UUID = z.string().uuid();
const INSTANT = z.string().datetime({ offset: true });
const OPAQUE = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const DECIMAL = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u).max(64);
const SIGNED_DECIMAL = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u).max(64);
const MEASUREMENT_TYPE = z.enum(["weight", "recumbent_length", "standing_height", "head_circumference"]);
const UNIT = z.enum(["kg", "g", "lb", "oz", "lb_oz", "cm", "mm", "in"]);
const MEASUREMENT_METHOD = z.enum(["digital_scale", "mechanical_scale", "length_board", "stadiometer", "tape_measure", "unknown"]);
const PROVENANCE = z.enum(["guardian", "professional", "import", "document", "chat"]);

const DECLARED_VALUE = z.union([
  DECIMAL,
  z.object({ pounds: DECIMAL, ounces: DECIMAL }).strict(),
]);

export const ANTHROPOMETRY_CREATE_REQUEST_SCHEMA = z.object({
  version: z.literal(ANTHROPOMETRY_VERSION),
  measurement: z.object({
    measurementType: MEASUREMENT_TYPE,
    value: DECLARED_VALUE,
    unit: UNIT,
    occurredAt: INSTANT,
    measurementMethod: MEASUREMENT_METHOD.optional(),
    provenanceType: PROVENANCE.optional(),
    sourceNote: z.string().min(1).max(500).optional(),
  }).strict(),
  confirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  const isWeight = value.measurement.measurementType === "weight";
  const weightUnit = ["kg", "g", "lb", "oz", "lb_oz"].includes(value.measurement.unit);
  const pair = typeof value.measurement.value !== "string";
  if (isWeight !== weightUnit) context.addIssue({ code: "custom", path: ["measurement", "unit"], message: "unit_type_mismatch" });
  if ((value.measurement.unit === "lb_oz") !== pair) context.addIssue({ code: "custom", path: ["measurement", "value"], message: "lb_oz_shape_mismatch" });
  if (value.measurement.unit !== "lb_oz" && pair) context.addIssue({ code: "custom", path: ["measurement", "value"], message: "value_shape_invalid" });
});

export type AnthropometryCreateRequest = Readonly<z.infer<typeof ANTHROPOMETRY_CREATE_REQUEST_SCHEMA>>;

export const ANTHROPOMETRY_MEASUREMENT_RESPONSE_SCHEMA = z.object({
  id: UUID,
  measurementType: MEASUREMENT_TYPE,
  value: DECIMAL,
  unit: z.enum(["kg", "cm"]),
  occurredAt: INSTANT,
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  timeZone: z.string().min(1).max(128),
  measurementMethod: MEASUREMENT_METHOD,
  provenanceType: PROVENANCE,
  sourceNote: z.string().max(500).nullable().optional(),
}).strict();

const ASSESSMENT_RESPONSE = z.object({
  status: z.literal("rule_unavailable"),
  reason: z.literal("APPROVAL_UNAVAILABLE"),
  indicator: z.null(),
  ageBasis: z.null(),
  ageDays: z.null(),
  zScore: z.null(),
  percentile: z.null(),
}).strict();

const GROWTH_POINT_RESPONSE = z.object({
  occurredAt: INSTANT,
  measurementType: MEASUREMENT_TYPE,
  value: DECIMAL,
  unit: z.enum(["kg", "cm"]),
  indicator: z.enum(["weight_for_age", "length_for_age", "height_for_age", "weight_for_length", "weight_for_height", "head_circumference_for_age", "bmi_for_age"]),
  ageBasis: z.enum(["chronological", "corrected"]),
  ageDays: z.number().int().nonnegative().max(10_000),
  status: z.enum(["calculated", "rule_unavailable", "insufficient_data", "excluded"]),
  zScore: SIGNED_DECIMAL.nullable(),
  percentile: DECIMAL.nullable(),
  interpretation: z.enum(["within_expected", "review_required", "urgent_review", "unavailable"]),
  warnings: z.array(z.enum(["age_unavailable", "corrected_age_unavailable", "standard_unavailable", "dataset_unavailable", "numerical_instability", "insufficient_companion", "measurement_excluded", "transition_boundary", "precision_limited", "review_required"])).max(12),
  provenance: z.object({
    standardKey: OPAQUE,
    standardVersion: OPAQUE,
    referenceCode: OPAQUE,
    citationHandle: z.string().regex(/^citation:v1:[a-f0-9]{64}$/u),
  }).strict(),
}).strict().superRefine((point, context) => {
  if ((point.status === "calculated") !== (point.zScore !== null && point.percentile !== null)) {
    context.addIssue({ code: "custom", path: ["status"], message: "calculated_values_mismatch" });
  }
});

const GROWTH_SUMMARY_READY_RESPONSE_SCHEMA = z.object({
  version: z.literal(GROWTH_SUMMARY_VERSION),
  requestId: OPAQUE,
  status: z.literal("ready"),
  code: z.null(),
  points: z.array(GROWTH_POINT_RESPONSE).max(48),
  chart: z.object({
    currentAgeCompletedMonths: z.number().int().nonnegative().max(2000).nullable(),
    observations: z.array(z.object({
      measurementId: UUID,
      ageMonths: z.number().finite().nonnegative().max(2000),
      ageBasis: z.literal("chronological"),
    }).strict()).max(48),
    copy: z.object({
      summaryTitle: z.string().max(80), withinExpected: z.string().max(240),
      reviewRequired: z.string().max(240), unavailable: z.string().max(240), disclaimer: z.string().max(240),
    }).strict(),
  }).strict().optional(),
}).strict();

export const ANTHROPOMETRY_CREATE_RESPONSE_SCHEMA = z.object({
  version: z.literal(ANTHROPOMETRY_VERSION),
  requestId: OPAQUE,
  outcome: z.enum(["created", "idempotent_replay"]),
  measurement: ANTHROPOMETRY_MEASUREMENT_RESPONSE_SCHEMA,
  assessment: ASSESSMENT_RESPONSE,
}).strict();

export const ANTHROPOMETRY_LIST_RESPONSE_SCHEMA = z.object({
  version: z.literal(ANTHROPOMETRY_VERSION),
  requestId: OPAQUE,
  measurements: z.array(ANTHROPOMETRY_MEASUREMENT_RESPONSE_SCHEMA).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
}).strict();

export const GROWTH_SUMMARY_UNAVAILABLE_RESPONSE_SCHEMA = z.object({
  version: z.literal(GROWTH_SUMMARY_VERSION),
  requestId: OPAQUE,
  status: z.literal("unavailable"),
  code: z.literal("RULE_UNAVAILABLE"),
  points: z.array(z.never()).max(48),
}).strict();

export const GROWTH_SUMMARY_RESPONSE_SCHEMA = z.union([
  GROWTH_SUMMARY_UNAVAILABLE_RESPONSE_SCHEMA,
  GROWTH_SUMMARY_READY_RESPONSE_SCHEMA,
]);

export type GrowthSummaryResponse = Readonly<z.infer<typeof GROWTH_SUMMARY_RESPONSE_SCHEMA>>;

export type AnthropometryRouteMeasurement = Readonly<z.infer<typeof ANTHROPOMETRY_MEASUREMENT_RESPONSE_SCHEMA>>;
export type AnthropometryRouteDependencies = Readonly<{
  scope: GrowthScopeResolver;
  persistence: GrowthPersistence;
  now?: () => Date;
}>;

export type GrowthScopeResolver = Readonly<{
  resolve(request: Request, auth: AuthenticatedChannelRequest, permission: ChildPermission): Promise<AuthorizedChildScope | null>;
}>;

export type GrowthPersistence = Readonly<{
  create(scope: AuthorizedChildScope, auth: AuthenticatedChannelRequest, input: AnthropometryCreateRequest, idempotencyKey: string, now: Date, signal: AbortSignal): Promise<Readonly<{ outcome: "created" | "idempotent_replay"; measurement: AnthropometryRouteMeasurement }> | Readonly<{ code: string; diagnosticCode?: string }> >;
  list(scope: AuthorizedChildScope, auth: AuthenticatedChannelRequest, input: Readonly<{ cursor: string | null }>, signal: AbortSignal): Promise<readonly AnthropometryRouteMeasurement[] | null>;
  summary(scope: AuthorizedChildScope, auth: AuthenticatedChannelRequest, signal: AbortSignal): Promise<Readonly<Omit<GrowthSummaryResponse, "version" | "requestId">> | null>;
}>;

function errorResponse(status: 400 | 403 | 409 | 422 | 503, code: string, diagnosticCode?: string): Response {
  const headers: Record<string, string> = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (diagnosticCode && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/u.test(diagnosticCode)) {
    headers["x-creciendo-persistence-code"] = diagnosticCode;
  }
  return Response.json({
    version: "creciendo.error.v1",
    code,
    retryable: status === 503,
    retryAfterSeconds: null,
    effectState: "none",
    resumable: false,
  }, { status, headers });
}

async function readJson(request: Request): Promise<unknown | null> {
  try { return await request.json(); } catch { return null; }
}

function validIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  return value && OPAQUE.safeParse(value).success ? value : null;
}

async function resolveScope(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: AnthropometryRouteDependencies,
  permission: ChildPermission,
): Promise<AuthorizedChildScope | null> {
  try { return await dependencies.scope.resolve(request, auth, permission); } catch { return null; }
}

export async function handleAnthropometryCreate(request: Request, auth: AuthenticatedChannelRequest, dependencies: AnthropometryRouteDependencies): Promise<Response> {
  const key = validIdempotencyKey(request);
  if (!key) return errorResponse(400, "REQUEST_INVALID");
  const raw = await readJson(request);
  const parsed = ANTHROPOMETRY_CREATE_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "REQUEST_INVALID");
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
  const scope = await resolveScope(request, auth, dependencies, "record");
  if (!scope) return errorResponse(403, "ACCESS_DENIED");
  try {
    const result = await dependencies.persistence.create(scope, auth, parsed.data, key, now, request.signal);
    if ("code" in result) {
      if (result.code === "IDEMPOTENCY_CONFLICT") return errorResponse(409, result.code);
      if (result.code === "INVALID_INPUT" || result.code === "CONFIRMATION_INVALID") return errorResponse(422, result.code);
      return errorResponse(503, "PERSISTENCE_UNAVAILABLE", result.diagnosticCode);
    }
    const response = ANTHROPOMETRY_CREATE_RESPONSE_SCHEMA.parse({
      version: ANTHROPOMETRY_VERSION,
      requestId: auth.requestId,
      outcome: result.outcome,
      measurement: result.measurement,
      assessment: { status: "rule_unavailable", reason: "APPROVAL_UNAVAILABLE", indicator: null, ageBasis: null, ageDays: null, zScore: null, percentile: null },
    });
    return Response.json(response, { status: result.outcome === "created" ? 201 : 200, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return errorResponse(503, "PERSISTENCE_UNAVAILABLE"); }
}

export async function handleAnthropometryList(request: Request, auth: AuthenticatedChannelRequest, dependencies: AnthropometryRouteDependencies): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor !== null && (cursor.length === 0 || cursor.length > 512)) return errorResponse(400, "REQUEST_INVALID");
  const scope = await resolveScope(request, auth, dependencies, "read");
  if (!scope) return errorResponse(403, "ACCESS_DENIED");
  try {
    const measurements = await dependencies.persistence.list(scope, auth, { cursor }, request.signal);
    if (!measurements || request.signal.aborted) return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
    const response = ANTHROPOMETRY_LIST_RESPONSE_SCHEMA.parse({ version: ANTHROPOMETRY_VERSION, requestId: auth.requestId, measurements, nextCursor: null });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return errorResponse(503, "PERSISTENCE_UNAVAILABLE"); }
}

export async function handleGrowthSummary(request: Request, auth: AuthenticatedChannelRequest, dependencies: AnthropometryRouteDependencies): Promise<Response> {
  const scope = await resolveScope(request, auth, dependencies, "read");
  if (!scope) return errorResponse(403, "ACCESS_DENIED");
  try {
    const summary = await dependencies.persistence.summary(scope, auth, request.signal);
    if (!summary || request.signal.aborted) return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
    const response = GROWTH_SUMMARY_RESPONSE_SCHEMA.parse({ version: GROWTH_SUMMARY_VERSION, requestId: auth.requestId, ...summary });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return errorResponse(503, "PERSISTENCE_UNAVAILABLE"); }
}

export function createGrowthScopeResolver(input: Readonly<{ tokens: ChildContextTokenService; authorizeChild: AuthorizeChildService; now?: () => Date }>): GrowthScopeResolver {
  return Object.freeze({
    async resolve(request, auth, permission) {
      const token = request.headers.get("x-child-context");
      const now = input.now?.() ?? new Date();
      if (!token || token.length > 4096 || !Number.isFinite(now.getTime())) return null;
      const claims = await input.tokens.verify(token, auth.guardian, now);
      if ("childId" in claims === false) return null;
      const scope = await input.authorizeChild.authorize({ guardian: auth.guardian, requestedChildId: claims.childId, requiredPermissions: [permission], requestId: auth.requestId, now });
      if ("childId" in scope === false
        || scope.actorUserId !== auth.guardian.userId
        || scope.careSpaceId !== claims.careSpaceId
        || scope.childId !== claims.childId
        || scope.authorizationVersion !== claims.authorizationVersion
        || !scope.permissions.includes(permission)) return null;
      return scope;
    },
  });
}

export function createAnthropometryRouteDependencies(config: RuntimeConfig, persistence: GrowthPersistence): AnthropometryRouteDependencies {
  return Object.freeze({
    scope: createGrowthScopeResolver({ tokens: createChildContextTokenService(config), authorizeChild: createAuthorizeChildService(config) }),
    persistence,
  });
}
