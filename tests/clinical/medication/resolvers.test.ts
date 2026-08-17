import { describe, expect, it } from "vitest";

import { resolveMedicationConcept } from "../../../src/clinical/medication/concept-resolver.ts";
import { resolveMedicationFormulary } from "../../../src/clinical/medication/formulary-resolver.ts";
import { resolveMedicationPresentation } from "../../../src/clinical/medication/presentation-resolver.ts";
import type { ApprovedMedicationPackage, MedicationConcept, MedicationPresentation } from "../../../src/clinical/medication/types.ts";

const concept = (overrides: Partial<MedicationConcept> = {}): MedicationConcept => ({
  id: "00000000-0000-0000-0000-000000000001" as MedicationConcept["id"],
  country: "CO",
  codingSystem: "INVIMA",
  conceptCode: "SYN-001",
  normalizedName: "concept alpha",
  displayName: "Concept Alpha",
  ingredients: [{ ingredientCode: "ING-A", codingSystem: "INVIMA", name: "Ingredient A" }],
  ...overrides,
});

const presentation = (overrides: Partial<MedicationPresentation> = {}): MedicationPresentation => ({
  id: "00000000-0000-0000-0000-000000000002" as MedicationPresentation["id"],
  conceptId: concept().id,
  country: "CO",
  form: "solution",
  route: "oral",
  release: "immediate",
  regulatoryIdentifier: "SYN-PRES-001",
  concentration: {
    numerator: "5" as never,
    numeratorUnit: "mg",
    denominator: "1" as never,
    denominatorUnit: "mL",
  },
  ingredients: concept().ingredients,
  ...overrides,
});

const approvedPackage = (overrides: Partial<ApprovedMedicationPackage> = {}): ApprovedMedicationPackage => ({
  packageId: "synthetic-package",
  country: "CO",
  version: "2026.08.test",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveUntil: null,
  algorithmVersion: "synthetic-algorithm-1",
  vocabularyVersion: "synthetic-vocabulary-1",
  status: "approved",
  approvedBy: "dr-trujillo",
  artifactSha256: "a".repeat(64),
  sources: [{ sourceId: "synthetic-source", sourceVersion: "1", sourceKind: "formulary", sourceUri: "https://example.invalid/source", artifactSha256: "b".repeat(64) }],
  ...overrides,
});

describe("medication identity and package resolvers", () => {
  it("resolves an exact jurisdiction-specific code", () => {
    const result = resolveMedicationConcept({ country: "CO", codingSystem: "INVIMA", conceptCode: "SYN-001" }, [concept()]);
    expect(result.status).toBe("resolved");
    expect(result.concept?.conceptCode).toBe("SYN-001");
  });

  it("does not fuzzy-match a medication concept", () => {
    const result = resolveMedicationConcept({ country: "CO", codingSystem: "INVIMA", name: "concept alph" }, [concept()]);
    expect(result.status).toBe("not_found");
    expect(result.concept).toBeNull();
  });

  it("rejects ambiguous normalized names instead of selecting one", () => {
    const result = resolveMedicationConcept({ country: "CO", codingSystem: "INVIMA", name: "concept alpha" }, [concept(), concept({ id: "00000000-0000-0000-0000-000000000003" as MedicationConcept["id"] })]);
    expect(result.status).toBe("ambiguous");
  });

  it("requires an exact presentation match including route and concentration", () => {
    const result = resolveMedicationPresentation({ conceptId: concept().id, country: "CO", form: "solution", route: "oral", release: "immediate", concentration: presentation().concentration }, [presentation()]);
    expect(result.status).toBe("resolved");
    expect(resolveMedicationPresentation({ conceptId: concept().id, country: "CO", form: "solution", route: "topical", release: "immediate", concentration: presentation().concentration }, [presentation()]).status).toBe("not_found");
  });

  it("fails closed when an approved package does not match country, date, algorithm, or checksum", () => {
    const result = resolveMedicationFormulary({
      country: "CO",
      at: "2026-08-16T12:00:00Z",
      algorithmVersion: "synthetic-algorithm-1",
      vocabularyVersion: "synthetic-vocabulary-1",
      requiredSourceIds: ["synthetic-source"],
      requiredArtifactSha256: "a".repeat(64),
    }, [approvedPackage({ country: "US" })]);
    expect(result.status).toBe("rule_unavailable");
    expect(result.package).toBeNull();
  });
});
