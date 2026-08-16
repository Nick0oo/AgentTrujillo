import type { SessionOperation } from "../../../agent/lib/access/access-lease-validator";

export type SessionRouteScenario = Readonly<{
  operation: SessionOperation;
  principal: "owner" | "sibling" | "co_guardian" | "foreign_space";
  state: "authorized" | "missing" | "revoked" | "expired" | "stale_version" | "wrong_permission" | "terminal" | "malformed" | "dependency_failure";
  expected: "allow" | "deny";
}>;

const operations: readonly SessionOperation[] = ["create", "follow_up", "stream", "cancel", "resume", "inspect"];
const deniedStates: readonly SessionRouteScenario["state"][] = ["missing", "revoked", "expired", "stale_version", "wrong_permission", "terminal", "malformed", "dependency_failure"];

export const SESSION_ROUTE_SCENARIOS: readonly SessionRouteScenario[] = Object.freeze([
  ...operations.map((operation) => ({ operation, principal: "owner" as const, state: "authorized" as const, expected: "allow" as const })),
  ...operations.flatMap((operation) => deniedStates.map((state) => ({ operation, principal: "owner" as const, state, expected: "deny" as const }))),
  ...operations.flatMap((operation) => ["sibling", "co_guardian", "foreign_space"].map((principal) => ({ operation, principal: principal as SessionRouteScenario["principal"], state: "missing" as const, expected: "deny" as const }))),
]);
