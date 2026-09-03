import type { ToolContext } from "eve/tools";

import {
  getTrustedToolAbortSignal,
  getTrustedToolActor,
  getTrustedToolServices,
  getTrustedToolSession,
  getTrustedToolTrace,
  requireActiveChildScope,
  TrustedToolContextError,
  type TrustedToolContext,
} from "./trusted-tool-context";
import {
  REGISTERED_TOOL_IDS,
  type RegisteredToolId,
} from "./tool-permission-policy";

export type TrustedToolInvocation = Readonly<{
  toolId: RegisteredToolId;
  eveSessionId: string;
  turnId: string;
  turnSequence: number;
  toolCallId: string;
  principalId: string;
  authenticator: string;
  abortSignal: AbortSignal;
}>;

export interface TrustedToolContextFactory {
  resolve(invocation: TrustedToolInvocation): Promise<TrustedToolContext>;
}

type TrustedClock = Readonly<{ now(): Date }>;

let applicationFactory: TrustedToolContextFactory | null = null;

function invalid(): never {
  throw new TrustedToolContextError("TRUSTED_TOOL_CONTEXT_INVALID");
}

function cancelled(): never {
  throw new TrustedToolContextError("TOOL_CONTEXT_CANCELLED");
}

function hasOnlyResolve(value: object): boolean {
  return Object.getOwnPropertyNames(value).sort().join("|") === "resolve"
    && Object.getOwnPropertySymbols(value).length === 0;
}

function currentTime(context: TrustedToolContext): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const raw = services.toolIdempotency;
    if (!raw || typeof raw !== "object") return invalid();
    const clock = raw as Partial<TrustedClock>;
    if (typeof clock.now !== "function") return invalid();
    const now = clock.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return invalid();
    return new Date(now);
  } catch (error) {
    if (error instanceof TrustedToolContextError) throw error;
    return invalid();
  }
}

export function installTrustedToolContextFactory(factory: TrustedToolContextFactory): void {
  if (applicationFactory) throw new Error("TRUSTED_TOOL_CONTEXT_FACTORY_ALREADY_INSTALLED");
  if (!factory || typeof factory !== "object" || Array.isArray(factory)
    || !Object.isFrozen(factory) || !hasOnlyResolve(factory)
    || typeof factory.resolve !== "function") {
    throw new Error("TRUSTED_TOOL_CONTEXT_FACTORY_INVALID");
  }
  applicationFactory = factory;
}

export async function resolveTrustedToolContextForEve(
  eveContext: ToolContext,
  expectedToolId: RegisteredToolId,
): Promise<TrustedToolContext> {
  if (!REGISTERED_TOOL_IDS.includes(expectedToolId)
    || !eveContext || typeof eveContext !== "object"
    || eveContext.toolName !== expectedToolId
    || typeof eveContext.callId !== "string" || eveContext.callId.length < 1
    || typeof eveContext.session?.id !== "string" || eveContext.session.id.length < 1
    || typeof eveContext.session.turn?.id !== "string" || eveContext.session.turn.id.length < 1
    || !Number.isSafeInteger(eveContext.session.turn.sequence)
    || eveContext.session.turn.sequence < 0
    || eveContext.session.parent !== undefined
    || !(eveContext.abortSignal instanceof AbortSignal)) return invalid();
  if (eveContext.abortSignal.aborted) return cancelled();

  const current = eveContext.session.auth.current;
  const initiator = eveContext.session.auth.initiator;
  if (!current || !initiator
    || typeof current.principalId !== "string" || current.principalId.length < 1
    || typeof current.authenticator !== "string" || current.authenticator.length < 1
    || current.principalId !== initiator.principalId) return invalid();
  if (!applicationFactory) return invalid();

  const invocation: TrustedToolInvocation = Object.freeze({
    toolId: expectedToolId,
    eveSessionId: eveContext.session.id,
    turnId: eveContext.session.turn.id,
    turnSequence: eveContext.session.turn.sequence,
    toolCallId: eveContext.callId,
    principalId: current.principalId,
    authenticator: current.authenticator,
    abortSignal: eveContext.abortSignal,
  });

  try {
    const trusted = await applicationFactory.resolve(invocation);
    const now = currentTime(trusted);
    const scope = requireActiveChildScope(trusted, now);
    const actor = getTrustedToolActor(trusted);
    const session = getTrustedToolSession(trusted);
    const trace = getTrustedToolTrace(trusted);
    if (scope.actorUserId !== current.principalId
      || actor.userId !== current.principalId
      || session.eveSessionId !== eveContext.session.id
      || trace.toolCallId !== eveContext.callId
      || getTrustedToolAbortSignal(trusted) !== eveContext.abortSignal) {
      console.error("[resolveTrustedToolContextForEve Validation Mismatch]:", {
        scopeActor: scope.actorUserId,
        currentPrincipal: current.principalId,
        actorUserId: actor.userId,
        sessionEveId: session.eveSessionId,
        eveContextSessionId: eveContext.session.id,
        traceToolCallId: trace.toolCallId,
        eveContextCallId: eveContext.callId,
      });
      return invalid();
    }
    return trusted;
  } catch (error) {
    if (error instanceof TrustedToolContextError && error.code === "TOOL_CONTEXT_CANCELLED") throw error;
    console.error("[resolveTrustedToolContextForEve Catch Error]:", error);
    return invalid();
  }
}
