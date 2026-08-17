import { hasPermission, isAuthorizedChildScopeActive, type AuthorizedChildScope, type ChildPermission } from "../../../agent/lib/access/authorized-child-scope.ts";

export function requireMedicationScope(scope: AuthorizedChildScope, permission: ChildPermission, now: Date): void {
  if (!isAuthorizedChildScopeActive(scope, now) || !hasPermission(scope, permission, now)) throw new Error("MEDICATION_SCOPE_DENIED");
}

export function requirePlanRecord(scope: AuthorizedChildScope, planId: string): void {
  if (!planId || scope.childId.length === 0) throw new Error("MEDICATION_SCOPE_DENIED");
}
