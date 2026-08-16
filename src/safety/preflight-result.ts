import type { SafetyDecision } from "./message-types";
import type { SafetyDecisionEvidence } from "./red-flag-evidence";

export type TerminalResponse = Readonly<{
  type: "emergency_recommendation" | "clarification" | "pediatrician_recommendation" | "abstain";
  decision: SafetyDecision;
}>;

export type ContinueAuthorization = Readonly<{
  requestId: string;
  sessionId: string;
}>;

export type ContinuePermit = Readonly<{
  consume(authorization: ContinueAuthorization): ContinueAuthorization;
}>;

export type PreflightResult = Readonly<{
  kind: "continue";
  permit: ContinuePermit;
  decision: SafetyDecision;
  decisionEvidence: SafetyDecisionEvidence;
}> | Readonly<{
  kind: "terminal";
  response: TerminalResponse;
  decisionEvidence: SafetyDecisionEvidence;
}> | Readonly<{
  kind: "denied";
  code: "ACCESS_DENIED";
}>;
