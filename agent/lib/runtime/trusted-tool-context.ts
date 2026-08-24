import { z } from "zod";

import {
  createAuthorizedChildScopeFromTrustedRow,
  isAuthorizedChildScopeActive,
  type AuthorizedChildScope,
  type TrustedAuthorizedScopeRow,
} from "../access/authorized-child-scope";
import type { GuardedSession } from "../access/session-route-guard";

const UUID = z.string().uuid();
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
const CAPABILITY = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/);
const LOCALE = z.enum(["es-CO", "en-US"]);

export type TrustedToolLocale = z.infer<typeof LOCALE>;
export type ToolServicePorts = Readonly<Record<string, object>>;

export type TrustedToolEntitlementsInput = Readonly<{
  careSpaceId: string;
  revision: string;
  capabilities: readonly string[];
  evaluatedAt: Date;
  expiresAt: Date;
}>;

export type TrustedToolEntitlements = Readonly<{
  careSpaceId: string;
  revision: string;
  capabilities: readonly string[];
  evaluatedAt: string;
  expiresAt: string;
}>;

export type TrustedToolActor = Readonly<{
  userId: string;
  authSessionId?: string;
  expiresAt: string;
}>;

export type TrustedToolSession = Readonly<{
  productSessionId: string;
  eveSessionId: string;
  authorizationVersion: string;
  authorizationExpiresAt: string;
  status: "active";
  lastSequence: number;
}>;

export type TrustedToolTrace = Readonly<{
  requestId: string;
  traceId: string;
  toolCallId: string;
}>;

export type CreateTrustedToolContextInput<TServices extends ToolServicePorts> = Readonly<{
  guarded: GuardedSession;
  runtimeSessionId: string;
  locale: TrustedToolLocale;
  entitlements: TrustedToolEntitlementsInput;
  trace: TrustedToolTrace;
  abortSignal: AbortSignal;
  services: TServices;
  now?: Date;
}>;

const CONTEXT_BRAND: unique symbol = Symbol("TrustedToolContext");

export type TrustedToolContext<TServices extends ToolServicePorts = ToolServicePorts> = Readonly<{
  readonly [CONTEXT_BRAND]: TServices;
  toJSON(): never;
}>;

export type TrustedToolContextErrorCode =
  | "TRUSTED_TOOL_CONTEXT_INVALID"
  | "TRUSTED_TOOL_CONTEXT_NOT_SERIALIZABLE"
  | "TOOL_CONTEXT_CANCELLED"
  | "TOOL_CONTEXT_EXPIRED";

export class TrustedToolContextError extends Error {
  constructor(readonly code: TrustedToolContextErrorCode) {
    super(code);
    this.name = "TrustedToolContextError";
  }
}

type StoredScope = Readonly<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  permissions: readonly string[];
  countryOfCare: "CO" | "US";
  timezone: string;
  authorizationVersion: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

type StoredContext = Readonly<{
  actor: TrustedToolActor;
  scope: StoredScope;
  session: TrustedToolSession;
  locale: TrustedToolLocale;
  entitlements: TrustedToolEntitlements;
  trace: TrustedToolTrace;
  abortSignal: AbortSignal;
  services: ToolServicePorts;
  actorExpiresAtMs: number;
  sessionExpiresAtMs: number;
  entitlementExpiresAtMs: number;
}>;

const STATES = new WeakMap<object, StoredContext>();

const entitlementSchema = z.object({
  careSpaceId: UUID,
  revision: OPAQUE_ID,
  capabilities: z.array(CAPABILITY).max(64),
  evaluatedAt: z.date(),
  expiresAt: z.date(),
}).strict();

const traceSchema = z.object({
  requestId: OPAQUE_ID,
  traceId: OPAQUE_ID,
  toolCallId: OPAQUE_ID,
}).strict();

const guardedSessionSchema = z.object({
  guardian: z.object({
    userId: UUID,
    issuedAt: z.date(),
    expiresAt: z.date(),
    authSessionId: OPAQUE_ID.optional(),
    bearerToken: z.string().min(1).max(16_384),
  }).strict(),
  scope: z.custom<AuthorizedChildScope>((value) => value !== null && typeof value === "object"),
  session: z.object({
    productSessionId: UUID,
    eveSessionId: OPAQUE_ID.nullable(),
    ownerUserId: UUID,
    careSpaceId: UUID,
    childId: UUID,
    authorizationVersion: OPAQUE_ID,
    authorizationExpiresAt: z.date(),
    status: z.enum(["active", "completed", "cancelled", "archived"]),
    lastSequence: z.number(),
  }).strict(),
  stopStreamMonitor: z.custom<() => void>((value) => typeof value === "function").optional(),
}).strict();

function validServices(value: unknown): value is ToolServicePorts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value);
  return entries.length <= 64 && entries.every(([key, port]) =>
    /^[a-z][A-Za-z0-9]*$/.test(key)
    && port !== null
    && (typeof port === "object" || typeof port === "function"));
}

const contextInputSchema = z.object({
  guarded: z.custom<GuardedSession>((value) => guardedSessionSchema.safeParse(value).success),
  runtimeSessionId: OPAQUE_ID,
  locale: LOCALE,
  entitlements: entitlementSchema,
  trace: traceSchema,
  abortSignal: z.custom<AbortSignal>((value) =>
    typeof AbortSignal !== "undefined" && value instanceof AbortSignal),
  services: z.custom<ToolServicePorts>(validServices),
  now: z.date().optional(),
}).strict();

function fail(code: TrustedToolContextErrorCode = "TRUSTED_TOOL_CONTEXT_INVALID"): never {
  throw new TrustedToolContextError(code);
}

function immutableDateString(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return value.toISOString();
}

function rebuildScope(scope: StoredScope): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    permissions: scope.permissions,
    countryOfCare: scope.countryOfCare,
    timezone: scope.timezone,
    authorizationVersion: scope.authorizationVersion,
    issuedAt: new Date(scope.issuedAtMs),
    expiresAt: new Date(scope.expiresAtMs),
  });
}

function stateOf<TServices extends ToolServicePorts>(
  context: TrustedToolContext<TServices>,
): StoredContext & Readonly<{ services: TServices }> {
  const state = STATES.get(context);
  if (!state) fail();
  return state as StoredContext & Readonly<{ services: TServices }>;
}

export function createTrustedToolContext<TServices extends ToolServicePorts>(
  input: CreateTrustedToolContextInput<TServices>,
): TrustedToolContext<TServices> {
  const parsedInput = contextInputSchema.safeParse(input);
  if (!parsedInput.success) fail();
  const trustedInput = parsedInput.data;
  if (trustedInput.abortSignal.aborted) fail("TOOL_CONTEXT_CANCELLED");

  const now = trustedInput.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail();

  let scope: AuthorizedChildScope;
  try {
    const source = trustedInput.guarded.scope;
    const row: TrustedAuthorizedScopeRow = {
      actorUserId: source.actorUserId,
      careSpaceId: source.careSpaceId,
      childId: source.childId,
      permissions: source.permissions,
      countryOfCare: source.countryOfCare,
      timezone: source.timezone,
      authorizationVersion: source.authorizationVersion,
      issuedAt: source.issuedAt,
      expiresAt: source.expiresAt,
    };
    scope = createAuthorizedChildScopeFromTrustedRow(row);
  } catch {
    fail();
  }

  const { guardian, session } = trustedInput.guarded;
  const guardianIssuedAtMs = guardian.issuedAt.getTime();
  const guardianExpiresAtMs = guardian.expiresAt?.getTime();
  const sessionExpiresAtMs = session.authorizationExpiresAt?.getTime();
  const evaluatedAtMs = trustedInput.entitlements.evaluatedAt.getTime();
  const entitlementExpiresAtMs = trustedInput.entitlements.expiresAt.getTime();
  const capabilities = trustedInput.entitlements.capabilities;
  const expectedLocale: TrustedToolLocale = scope.countryOfCare === "CO" ? "es-CO" : "en-US";

  if (!Number.isFinite(guardianIssuedAtMs)
    || guardianIssuedAtMs > now.getTime()
    || guardian.userId !== scope.actorUserId
    || guardianExpiresAtMs === undefined
    || !Number.isFinite(guardianExpiresAtMs)
    || guardianExpiresAtMs <= now.getTime()
    || !isAuthorizedChildScopeActive(scope, now)
    || session.ownerUserId !== scope.actorUserId
    || session.careSpaceId !== scope.careSpaceId
    || session.childId !== scope.childId
    || session.authorizationVersion !== scope.authorizationVersion
    || session.status !== "active"
    || !session.eveSessionId
    || session.eveSessionId !== trustedInput.runtimeSessionId
    || !UUID.safeParse(session.productSessionId).success
    || sessionExpiresAtMs === undefined
    || !Number.isFinite(sessionExpiresAtMs)
    || sessionExpiresAtMs <= now.getTime()
    || sessionExpiresAtMs > scope.expiresAt.getTime()
    || trustedInput.locale !== expectedLocale
    || trustedInput.entitlements.careSpaceId !== scope.careSpaceId
    || !Number.isFinite(evaluatedAtMs)
    || evaluatedAtMs > now.getTime()
    || !Number.isFinite(entitlementExpiresAtMs)
    || entitlementExpiresAtMs <= now.getTime()
    || new Set(capabilities).size !== capabilities.length
    || !Number.isSafeInteger(session.lastSequence)
    || session.lastSequence < 0
    || (guardian.authSessionId !== undefined && !OPAQUE_ID.safeParse(guardian.authSessionId).success)) {
    fail();
  }

  const storedScope: StoredScope = Object.freeze({
    actorUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    permissions: Object.freeze([...scope.permissions]),
    countryOfCare: scope.countryOfCare,
    timezone: scope.timezone,
    authorizationVersion: scope.authorizationVersion,
    issuedAtMs: scope.issuedAt.getTime(),
    expiresAtMs: scope.expiresAt.getTime(),
  });
  const actor: TrustedToolActor = Object.freeze({
    userId: guardian.userId,
    ...(guardian.authSessionId ? { authSessionId: guardian.authSessionId } : {}),
    expiresAt: immutableDateString(guardian.expiresAt),
  });
  const trustedSession: TrustedToolSession = Object.freeze({
    productSessionId: session.productSessionId,
    eveSessionId: session.eveSessionId,
    authorizationVersion: session.authorizationVersion,
    authorizationExpiresAt: immutableDateString(session.authorizationExpiresAt),
    status: "active",
    lastSequence: session.lastSequence,
  });
  const trustedEntitlements: TrustedToolEntitlements = Object.freeze({
    careSpaceId: trustedInput.entitlements.careSpaceId,
    revision: trustedInput.entitlements.revision,
    capabilities: Object.freeze([...capabilities].sort()),
    evaluatedAt: immutableDateString(trustedInput.entitlements.evaluatedAt),
    expiresAt: immutableDateString(trustedInput.entitlements.expiresAt),
  });
  const trustedTrace: TrustedToolTrace = Object.freeze({ ...trustedInput.trace });
  const services = Object.freeze({ ...trustedInput.services }) as TServices;

  const context = Object.create(null) as TrustedToolContext<TServices>;
  Object.defineProperties(context, {
    [CONTEXT_BRAND]: { value: true, enumerable: false },
    toJSON: {
      value: () => fail("TRUSTED_TOOL_CONTEXT_NOT_SERIALIZABLE"),
      enumerable: false,
    },
  });
  Object.freeze(context);
  STATES.set(context, Object.freeze({
    actor,
    scope: storedScope,
    session: trustedSession,
    locale: trustedInput.locale,
    entitlements: trustedEntitlements,
    trace: trustedTrace,
    abortSignal: trustedInput.abortSignal,
    services,
    actorExpiresAtMs: guardianExpiresAtMs,
    sessionExpiresAtMs,
    entitlementExpiresAtMs,
  }));
  return context;
}

export function requireActiveChildScope(
  context: TrustedToolContext,
  now = new Date(),
): AuthorizedChildScope {
  const state = stateOf(context);
  if (state.abortSignal.aborted) fail("TOOL_CONTEXT_CANCELLED");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail();
  if (now.getTime() < state.scope.issuedAtMs
    || now.getTime() >= state.scope.expiresAtMs
    || now.getTime() >= state.actorExpiresAtMs
    || now.getTime() >= state.sessionExpiresAtMs
    || now.getTime() >= state.entitlementExpiresAtMs) {
    fail("TOOL_CONTEXT_EXPIRED");
  }
  return rebuildScope(state.scope);
}

export function getTrustedToolActor(context: TrustedToolContext): TrustedToolActor {
  return stateOf(context).actor;
}

export function getTrustedToolSession(context: TrustedToolContext): TrustedToolSession {
  return stateOf(context).session;
}

export function getTrustedToolLocale(context: TrustedToolContext): TrustedToolLocale {
  return stateOf(context).locale;
}

export function getTrustedToolEntitlements(context: TrustedToolContext): TrustedToolEntitlements {
  return stateOf(context).entitlements;
}

export function getTrustedToolTrace(context: TrustedToolContext): TrustedToolTrace {
  return stateOf(context).trace;
}

export function getTrustedToolAbortSignal(context: TrustedToolContext): AbortSignal {
  return stateOf(context).abortSignal;
}

export function getTrustedToolServices<TServices extends ToolServicePorts>(
  context: TrustedToolContext<TServices>,
): TServices {
  return stateOf(context).services;
}
