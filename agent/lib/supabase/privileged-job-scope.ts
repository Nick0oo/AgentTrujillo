declare const privilegedJobScopeBrand: unique symbol;

export type PrivilegedOperation =
  | "workflow:summary"
  | "workflow:growth-analysis"
  | "workflow:memory-embedding"
  | "workflow:reminder-projection"
  | "webhook:billing-ledger"
  | "maintenance:retention";

export type PrivilegedJobScope = Readonly<{
  readonly [privilegedJobScopeBrand]: true;
  jobName: string;
  invocationId: string;
  careSpaceId?: string;
  childId?: string;
  allowedOperations: readonly PrivilegedOperation[];
  issuedAt: Date;
  expiresAt: Date;
}>;

export const PRIVILEGED_OPERATIONS: readonly PrivilegedOperation[] = Object.freeze([
  "workflow:summary",
  "workflow:growth-analysis",
  "workflow:memory-embedding",
  "workflow:reminder-projection",
  "webhook:billing-ledger",
  "maintenance:retention",
]);
