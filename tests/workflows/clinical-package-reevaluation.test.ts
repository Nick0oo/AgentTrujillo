import { afterEach, describe, expect, it, vi } from "vitest";
import { FatalError, RetryableError } from "workflow";
import { clinicalPackageReevaluationWorkflow, configurePackageReevaluationPorts, loadAffectedChildren, type AffectedChild, type PackageReevaluationInput, type PackageReevaluationPorts } from "../../src/workflows/clinical-package-reevaluation";

const INPUT: PackageReevaluationInput = Object.freeze({ releaseId: "release-1", packageId: "package-1", packageVersion: "v2", country: "CO", releaseDigest: "a".repeat(64), maxChildren: 10 });
const CHILD: AffectedChild = Object.freeze({ childId: "child-1", careSpaceId: "space-1", ownerUserId: "owner-1", country: "CO", assessmentVersion: "assessment.v1" });
function makePorts(overrides: Partial<PackageReevaluationPorts> = {}): PackageReevaluationPorts { return { loadAffectedChildren: vi.fn().mockResolvedValue([CHILD]), reevaluateChild: vi.fn().mockResolvedValue("updated"), ...overrides }; }
afterEach(() => configurePackageReevaluationPorts(null));
describe("clinical package reevaluation workflow", () => {
  it("reevaluates bounded same-jurisdiction children", async () => { const p = makePorts(); configurePackageReevaluationPorts(p); await expect(clinicalPackageReevaluationWorkflow(INPUT)).resolves.toEqual({ status: "completed", processed: 1, updated: 1 }); });
  it("rejects a cross-country child before effects", async () => { const p = makePorts({ loadAffectedChildren: vi.fn().mockResolvedValue([{ ...CHILD, country: "US" }]) }); configurePackageReevaluationPorts(p); await expect(loadAffectedChildren(INPUT)).rejects.toBeInstanceOf(FatalError); expect(p.reevaluateChild).not.toHaveBeenCalled(); });
  it("bounds fan-out", async () => { const p = makePorts({ loadAffectedChildren: vi.fn().mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({ ...CHILD, childId: `child-${i}` }))) }); configurePackageReevaluationPorts(p); await expect(loadAffectedChildren(INPUT)).rejects.toBeInstanceOf(FatalError); });
  it("classifies storage outage as retryable", async () => { const p = makePorts({ reevaluateChild: vi.fn().mockRejectedValue(new Error("unavailable")) }); configurePackageReevaluationPorts(p); await expect(clinicalPackageReevaluationWorkflow(INPUT)).rejects.toBeInstanceOf(RetryableError); });
});
