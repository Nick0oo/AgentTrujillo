import { FatalError, RetryableError } from "workflow";

export type RetentionCleanupRequest = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  memoryItemId: string;
  requestId: string;
  requestSha256: string;
  idempotencyKey: string;
}>;

export type CleanupAuthorization = Readonly<{
  requestId: string;
  memoryItemId: string;
  careSpaceId: string;
  childId: string;
  status: "pending" | "completed" | "legal_hold";
  legalHold: boolean;
  resourceVersion: string;
}>;

export type CleanupPlan = Readonly<{
  planSha256: string;
  vectorCount: number;
  objectCount: number;
  rowCount: number;
  cacheCount: number;
  linkCount: number;
  summaryCount: number;
}>;

export type RetentionCleanupPorts = Readonly<{
  loadAuthorizedRequest(input: RetentionCleanupRequest): Promise<CleanupAuthorization>;
  revokeEligibility(input: RetentionCleanupRequest, authorization: CleanupAuthorization): Promise<CleanupPlan>;
  deleteVectors(input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void>;
  deleteObjects(input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void>;
  deleteRows(input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void>;
  purgeCaches(input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void>;
  verifyClosure(input: RetentionCleanupRequest, plan: CleanupPlan): Promise<Readonly<{ orphanCount: number; proofSha256: string }>>;
  finalizeEvidence(input: RetentionCleanupRequest, plan: CleanupPlan, proof: Readonly<{ orphanCount: number; proofSha256: string }>): Promise<"completed" | "idempotent_replay">;
}>;

let ports: RetentionCleanupPorts | null = null;

export function configureRetentionCleanupPorts(value: RetentionCleanupPorts | null): void {
  ports = value;
}

function runtime(): RetentionCleanupPorts {
  if (!ports) throw new FatalError("RETENTION_CLEANUP_RUNTIME_UNCONFIGURED");
  return ports;
}

function validInput(input: RetentionCleanupRequest): boolean {
  return Object.values(input).every((value) => typeof value === "string" && value.length > 0 && value.length <= 512)
    && /^[a-f0-9]{64}$/u.test(input.requestSha256);
}

function validAuthorization(input: RetentionCleanupRequest, authorization: CleanupAuthorization): boolean {
  return authorization.requestId === input.requestId
    && authorization.memoryItemId === input.memoryItemId
    && authorization.careSpaceId === input.careSpaceId
    && authorization.childId === input.childId
    && authorization.resourceVersion.length > 0
    && (authorization.status === "pending" || authorization.status === "completed" || authorization.status === "legal_hold")
    && authorization.legalHold === (authorization.status === "legal_hold");
}

function validPlan(plan: CleanupPlan): boolean {
  return /^[a-f0-9]{64}$/u.test(plan.planSha256)
    && Object.values(plan).filter((value) => typeof value === "number").every((value) => Number.isInteger(value) && value >= 0 && value <= 100_000);
}

export async function loadAuthorizedRequest(input: RetentionCleanupRequest): Promise<CleanupAuthorization> {
  "use step";
  if (!validInput(input)) throw new FatalError("RETENTION_CLEANUP_INVALID_INPUT");
  let authorization: CleanupAuthorization;
  try { authorization = await runtime().loadAuthorizedRequest(input); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("RETENTION_CLEANUP_AUTHORIZATION_UNAVAILABLE", { retryAfter: "10s" });
  }
  if (!validAuthorization(input, authorization)) throw new FatalError("RETENTION_CLEANUP_SCOPE_INVALID");
  return Object.freeze({ ...authorization });
}

export async function revokeEligibility(input: RetentionCleanupRequest, authorization: CleanupAuthorization): Promise<CleanupPlan> {
  "use step";
  if (!validInput(input) || !validAuthorization(input, authorization) || authorization.status !== "pending" || authorization.legalHold) throw new FatalError("RETENTION_CLEANUP_REVOCATION_INVALID");
  let plan: CleanupPlan;
  try { plan = await runtime().revokeEligibility(input, authorization); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("RETENTION_CLEANUP_REVOCATION_UNAVAILABLE", { retryAfter: "10s" });
  }
  if (!validPlan(plan)) throw new FatalError("RETENTION_CLEANUP_PLAN_INVALID");
  return Object.freeze({ ...plan });
}

async function effectStep(name: "deleteVectors" | "deleteObjects" | "deleteRows" | "purgeCaches", input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void> {
  "use step";
  if (!validInput(input) || !validPlan(plan)) throw new FatalError("RETENTION_CLEANUP_EFFECT_INVALID");
  try { await runtime()[name](input, plan); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError(`RETENTION_CLEANUP_${name.toUpperCase()}_UNAVAILABLE`, { retryAfter: "30s" });
  }
}

export const deleteVectors = (input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void> => effectStep("deleteVectors", input, plan);
export const deleteObjects = (input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void> => effectStep("deleteObjects", input, plan);
export const deleteRows = (input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void> => effectStep("deleteRows", input, plan);
export const purgeCaches = (input: RetentionCleanupRequest, plan: CleanupPlan): Promise<void> => effectStep("purgeCaches", input, plan);

export async function verifyClosure(input: RetentionCleanupRequest, plan: CleanupPlan): Promise<Readonly<{ orphanCount: number; proofSha256: string }>> {
  "use step";
  if (!validInput(input) || !validPlan(plan)) throw new FatalError("RETENTION_CLEANUP_CLOSURE_INVALID");
  let result: Readonly<{ orphanCount: number; proofSha256: string }>;
  try { result = await runtime().verifyClosure(input, plan); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("RETENTION_CLEANUP_CLOSURE_UNAVAILABLE", { retryAfter: "30s" });
  }
  if (!Number.isInteger(result.orphanCount) || result.orphanCount < 0 || !/^[a-f0-9]{64}$/u.test(result.proofSha256)) throw new FatalError("RETENTION_CLEANUP_PROOF_INVALID");
  if (result.orphanCount > 0) throw new RetryableError("RETENTION_CLEANUP_CLOSURE_INCOMPLETE", { retryAfter: "30s" });
  return Object.freeze({ ...result });
}

export async function finalizeEvidence(input: RetentionCleanupRequest, plan: CleanupPlan, proof: Readonly<{ orphanCount: number; proofSha256: string }>): Promise<"completed" | "idempotent_replay"> {
  "use step";
  if (!validInput(input) || !validPlan(plan) || proof.orphanCount !== 0 || !/^[a-f0-9]{64}$/u.test(proof.proofSha256)) throw new FatalError("RETENTION_CLEANUP_EVIDENCE_INVALID");
  try { return await runtime().finalizeEvidence(input, plan, proof); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("RETENTION_CLEANUP_EVIDENCE_UNAVAILABLE", { retryAfter: "10s" });
  }
}

export async function retentionCleanupWorkflow(input: RetentionCleanupRequest): Promise<Readonly<{ status: "completed" | "legal_hold" | "idempotent_replay" }>> {
  "use workflow";
  const authorization = await loadAuthorizedRequest(input);
  if (authorization.status === "legal_hold") return Object.freeze({ status: "legal_hold" });
  if (authorization.status === "completed") return Object.freeze({ status: "idempotent_replay" });
  const plan = await revokeEligibility(input, authorization);
  await deleteVectors(input, plan);
  await deleteObjects(input, plan);
  await deleteRows(input, plan);
  await purgeCaches(input, plan);
  const proof = await verifyClosure(input, plan);
  return Object.freeze({ status: await finalizeEvidence(input, plan, proof) });
}
