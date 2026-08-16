import { deepFreeze, type NormalizedMessage, type RawGuardianMessage, type SafetyDecision, type TrustedSafetyContext } from "./message-types";
import { normalizeMessage } from "./normalize-message";
import { evaluateRedFlags, type SafetyEngineLimits } from "./red-flag-engine";
import type { CompiledRedFlagPack } from "./red-flag-pack-types";
import type { SafetyDecisionEvidence, SafetyEngineResult } from "./red-flag-evidence";
import { ClinicalResponsePolicy } from "./clinical-response-policy";
import type { ContinueAuthorization, ContinuePermit, PreflightResult, TerminalResponse } from "./preflight-result";

export type AccessLeaseValidator = Readonly<{ validate(input: Readonly<{ requestId: string; sessionId: string; scopeFingerprint: string }>, signal: AbortSignal): boolean | Promise<boolean> }>;
export type EmergencyPackageProvider = Readonly<{ resolve(input: Readonly<{ countryOfCare: "CO" | "US"; locale: "es-CO" | "en-US"; referenceInstant: Date }>, signal: AbortSignal): CompiledRedFlagPack | Promise<CompiledRedFlagPack | null> | null }>;
export type SafetyEvaluationRecorder = Readonly<{ recordOnce(input: Readonly<{ requestId: string; sessionId: string; scopeFingerprint: string; decision: SafetyDecision; evidence: SafetyDecisionEvidence }>, signal: AbortSignal): void | Promise<void> }>;
export type SafetyPackageFailure = Readonly<{ reason: "PACKAGE_UNAVAILABLE" | "PACKAGE_ERROR" }>;

export type PreflightInput = Readonly<{
  requestId: string;
  sessionId: string;
  rawMessage: RawGuardianMessage;
  trustedContext: TrustedSafetyContext;
  access: AccessLeaseValidator;
  packages: EmergencyPackageProvider;
  recorder?: SafetyEvaluationRecorder;
  engineLimits?: SafetyEngineLimits;
  signal?: AbortSignal;
}>;

function emptyEvidence(warning: string): SafetyDecisionEvidence {
  return Object.freeze({ evidence: Object.freeze([]), warnings: Object.freeze([warning]), operationCount: 0 });
}

function terminalFor(decision: SafetyDecision): TerminalResponse {
  if (decision.decision === "urgent") return Object.freeze({ type: "emergency_recommendation", decision });
  if (decision.decision === "clarification_required") return Object.freeze({ type: "clarification", decision });
  if (decision.decision === "professional_review") return Object.freeze({ type: "pediatrician_recommendation", decision });
  return Object.freeze({ type: "abstain", decision });
}

function createPermit(input: PreflightInput): ContinuePermit {
  let consumed = false;
  return Object.freeze({
    consume(authorization: ContinueAuthorization): ContinueAuthorization {
      if (consumed || authorization.requestId !== input.requestId || authorization.sessionId !== input.sessionId) throw new Error("CONTINUE_PERMIT_INVALID");
      consumed = true;
      return Object.freeze({ requestId: authorization.requestId, sessionId: authorization.sessionId });
    },
  });
}

async function recordBestEffort(input: PreflightInput, decision: SafetyDecision, evidence: SafetyDecisionEvidence, signal: AbortSignal): Promise<void> {
  if (!input.recorder) return;
  try {
    await input.recorder.recordOnce({ requestId: input.requestId, sessionId: input.sessionId, scopeFingerprint: input.trustedContext.scopeFingerprint, decision, evidence }, signal);
  } catch {
    // Audit outage is observable by the caller's operational metrics, never by the safety decision.
  }
}

export class SafetyPreflight {
  async evaluate(input: PreflightInput, signal: AbortSignal = input.signal ?? new AbortController().signal): Promise<PreflightResult> {
    if (signal.aborted) return deepFreeze({ kind: "terminal", response: terminalFor({ decision: "indeterminate", responseMode: "abstain", reasonCode: "CANCELLED" }), decisionEvidence: emptyEvidence("CANCELLED") });
    const authorized = await input.access.validate({ requestId: input.requestId, sessionId: input.sessionId, scopeFingerprint: input.trustedContext.scopeFingerprint }, signal);
    if (!authorized) return deepFreeze({ kind: "denied", code: "ACCESS_DENIED" });
    if (signal.aborted) return deepFreeze({ kind: "terminal", response: terminalFor({ decision: "indeterminate", responseMode: "abstain", reasonCode: "CANCELLED" }), decisionEvidence: emptyEvidence("CANCELLED") });
    let pack: CompiledRedFlagPack | null;
    try {
      pack = await input.packages.resolve({ countryOfCare: input.trustedContext.countryOfCare, locale: input.trustedContext.locale, referenceInstant: new Date(input.trustedContext.referenceInstant.getTime()) }, signal);
    } catch {
      pack = null;
    }
    if (!pack) {
      const decision: SafetyDecision = { decision: "indeterminate", responseMode: "abstain", reasonCode: "PACKAGE_UNAVAILABLE" };
      const evidence = emptyEvidence("PACKAGE_UNAVAILABLE");
      await recordBestEffort(input, decision, evidence, signal);
      return deepFreeze({ kind: "terminal", response: terminalFor(decision), decisionEvidence: evidence });
    }
    let normalized: NormalizedMessage;
    try {
      normalized = normalizeMessage(input.rawMessage);
    } catch {
      const decision: SafetyDecision = { decision: "indeterminate", responseMode: "abstain", reasonCode: "INVALID_MESSAGE" };
      const evidence = emptyEvidence("INVALID_MESSAGE");
      await recordBestEffort(input, decision, evidence, signal);
      return deepFreeze({ kind: "terminal", response: terminalFor(decision), decisionEvidence: evidence });
    }
    let evaluated: SafetyEngineResult;
    try {
      evaluated = evaluateRedFlags({ message: normalized, trustedContext: input.trustedContext }, pack, input.engineLimits);
    } catch {
      const decision: SafetyDecision = { decision: "indeterminate", responseMode: "abstain", reasonCode: "ENGINE_ERROR" };
      const evidence = emptyEvidence("ENGINE_ERROR");
      await recordBestEffort(input, decision, evidence, signal);
      return deepFreeze({ kind: "terminal", response: terminalFor(decision), decisionEvidence: evidence });
    }
    await recordBestEffort(input, evaluated, { evidence: evaluated.evidence, warnings: evaluated.warnings, operationCount: evaluated.operationCount }, signal);
    if (evaluated.decision !== "not_urgent") return deepFreeze({ kind: "terminal", response: terminalFor(evaluated), decisionEvidence: { evidence: evaluated.evidence, warnings: evaluated.warnings, operationCount: evaluated.operationCount } });
    return deepFreeze({ kind: "continue", permit: createPermit(input), decision: evaluated, decisionEvidence: { evidence: evaluated.evidence, warnings: evaluated.warnings, operationCount: evaluated.operationCount } });
  }

  async consumePermit(input: Readonly<{ permit: ContinuePermit; authorization: ContinueAuthorization; access: AccessLeaseValidator; scopeFingerprint: string; signal?: AbortSignal }>): Promise<ContinueAuthorization> {
    const signal = input.signal ?? new AbortController().signal;
    if (signal.aborted || !(await input.access.validate({ requestId: input.authorization.requestId, sessionId: input.authorization.sessionId, scopeFingerprint: input.scopeFingerprint }, signal))) throw new Error("CONTINUE_PERMIT_INVALID");
    return input.permit.consume(input.authorization);
  }
}

export const defaultClinicalResponsePolicy = new ClinicalResponsePolicy();
