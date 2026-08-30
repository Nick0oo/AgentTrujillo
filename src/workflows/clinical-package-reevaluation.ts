import { FatalError, RetryableError } from "workflow";

export type PackageReevaluationInput = Readonly<{ releaseId: string; packageId: string; packageVersion: string; country: "CO" | "US"; releaseDigest: string; maxChildren: number }>;
export type AffectedChild = Readonly<{ childId: string; careSpaceId: string; ownerUserId: string; country: "CO" | "US"; assessmentVersion: string }>;
export type PackageReevaluationPorts = Readonly<{
  loadAffectedChildren(input: PackageReevaluationInput): Promise<readonly AffectedChild[]>;
  reevaluateChild(input: PackageReevaluationInput, child: AffectedChild): Promise<"updated" | "idempotent_replay" | "unchanged">;
}>;
let ports: PackageReevaluationPorts | null = null;
export function configurePackageReevaluationPorts(value: PackageReevaluationPorts | null): void { ports = value; }
function runtime(): PackageReevaluationPorts { if (!ports) throw new FatalError("PACKAGE_REEVALUATION_RUNTIME_UNCONFIGURED"); return ports; }
function valid(input: PackageReevaluationInput): boolean { return Object.values(input).every((value) => typeof value === "string" || typeof value === "number") && input.releaseDigest.length === 64 && /^[a-f0-9]{64}$/u.test(input.releaseDigest) && input.maxChildren > 0 && input.maxChildren <= 500; }

export async function loadAffectedChildren(input: PackageReevaluationInput): Promise<readonly AffectedChild[]> { "use step"; if (!valid(input)) throw new FatalError("PACKAGE_REEVALUATION_INVALID_INPUT"); let children: readonly AffectedChild[]; try { children = await runtime().loadAffectedChildren(input); } catch { throw new RetryableError("PACKAGE_REEVALUATION_SOURCE_UNAVAILABLE", { retryAfter: "30s" }); } if (children.length > input.maxChildren || !children.every((child) => child.country === input.country && child.childId.length > 0 && child.careSpaceId.length > 0 && child.ownerUserId.length > 0)) throw new FatalError("PACKAGE_REEVALUATION_SCOPE_INVALID"); return Object.freeze([...children]); }
export async function reevaluateChild(input: PackageReevaluationInput, child: AffectedChild): Promise<"updated" | "idempotent_replay" | "unchanged"> { "use step"; if (!valid(input) || child.country !== input.country) throw new FatalError("PACKAGE_REEVALUATION_SCOPE_MISMATCH"); try { const outcome = await runtime().reevaluateChild(input, child); return outcome; } catch { throw new RetryableError("PACKAGE_REEVALUATION_WRITE_UNAVAILABLE", { retryAfter: "30s" }); } }
export async function clinicalPackageReevaluationWorkflow(input: PackageReevaluationInput): Promise<Readonly<{ status: "completed"; processed: number; updated: number }>> { "use workflow"; const children = await loadAffectedChildren(input); let updated = 0; for (const child of children) { const result = await reevaluateChild(input, child); if (result === "updated") updated += 1; } return Object.freeze({ status: "completed", processed: children.length, updated }); }
