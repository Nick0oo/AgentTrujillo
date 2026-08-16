import { deepFreeze, type ApprovedClarification, type ApprovedEmergencyCopyKey, type SafetyDecision } from "./message-types";

export function urgentDecision(ruleCodes: readonly string[], copyKey: ApprovedEmergencyCopyKey): SafetyDecision {
  return deepFreeze({ decision: "urgent", responseMode: "emergency_recommendation", ruleCodes: [...new Set(ruleCodes)].sort(), copyKey });
}

export function clarificationDecision(question: ApprovedClarification): SafetyDecision {
  return deepFreeze({ decision: "clarification_required", responseMode: "clarify", question });
}

export function indeterminateDecision(reasonCode: string): SafetyDecision {
  return deepFreeze({ decision: "indeterminate", responseMode: "abstain", reasonCode });
}
