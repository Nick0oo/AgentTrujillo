import { describe, expect, it } from "vitest";

import { loadBasicMedicationArtifact } from "../../../src/clinical/medication/basic-formulary.ts";
import { convertMedicationConcentration } from "../../../src/clinical/medication/concentration-converter.ts";
import { compareMedicationDailyExposure } from "../../../src/clinical/medication/daily-comparator.ts";
import { selectMedicationDoseRule } from "../../../src/clinical/medication/dose-limit-selector.ts";
import { compareMedicationPerDose } from "../../../src/clinical/medication/per-dose-comparator.ts";
import { resolveMedicationConcept } from "../../../src/clinical/medication/concept-resolver.ts";
import { resolveMedicationFormulary } from "../../../src/clinical/medication/formulary-resolver.ts";
import { resolveMedicationPresentation } from "../../../src/clinical/medication/presentation-resolver.ts";

describe("minimal source-bound acetaminophen formularies", () => {
  it("resolves only the exact country identity, presentation, and active package", () => {
    for (const country of ["CO", "US"] as const) {
      const artifact = loadBasicMedicationArtifact(country);
      const concept = resolveMedicationConcept({ country, codingSystem: artifact.concept.codingSystem, conceptCode: artifact.concept.conceptCode }, [artifact.concept]);
      expect(concept.status).toBe("resolved");
      expect(resolveMedicationConcept({ country: country === "CO" ? "US" : "CO", codingSystem: artifact.concept.codingSystem, conceptCode: artifact.concept.conceptCode }, [artifact.concept]).status).toBe("not_found");
      const presentation = resolveMedicationPresentation({
        conceptId: artifact.concept.id,
        country,
        form: artifact.presentation.form,
        route: artifact.presentation.route,
        release: artifact.presentation.release,
        concentration: artifact.presentation.concentration,
      }, [artifact.presentation]);
      expect(presentation.status).toBe("resolved");
      expect(resolveMedicationFormulary({
        country,
        at: "2026-08-22T12:00:00Z",
        algorithmVersion: artifact.package.algorithmVersion,
        vocabularyVersion: artifact.package.vocabularyVersion,
        requiredSourceIds: artifact.package.sources.map((source) => source.sourceId),
        requiredArtifactSha256: artifact.package.artifactSha256,
      }, [artifact.package]).status).toBe("resolved");
    }
  });

  it("uses the exact CO label bands and leaves source gaps unavailable", () => {
    const artifact = loadBasicMedicationArtifact("CO");
    const select = (weightKg: string) => selectMedicationDoseRule({ conceptCode: artifact.concept.conceptCode, route: "oral", ageDays: 1_825, weightKg, indicationCode: null }, artifact.rules);
    expect(select("12").rule?.perDoseMax).toBe("144");
    expect(select("14").rule?.perDoseMax).toBe("144");
    expect(select("14.05").status).toBe("insufficient_data");
    expect(select("14.1").rule?.perDoseMax).toBe("176");
    expect(select("45").rule?.perDoseMax).toBe("464");
    expect(select("45.1").status).toBe("insufficient_data");
    for (const rule of artifact.rules) {
      expect(select(rule.minWeightKg!).rule?.ruleId).toBe(rule.ruleId);
      expect(select(rule.maxWeightKg!).rule?.ruleId).toBe(rule.ruleId);
    }
  });

  it("uses exact pound-to-kilogram US label boundaries without extrapolation", () => {
    const artifact = loadBasicMedicationArtifact("US");
    const select = (weightKg: string) => selectMedicationDoseRule({ conceptCode: artifact.concept.conceptCode, route: "oral", ageDays: 1_825, weightKg, indicationCode: null }, artifact.rules);
    expect(select("10.88621688").rule?.perDoseMax).toBe("160");
    expect(select("15.87573295").rule?.perDoseMax).toBe("160");
    expect(select("16").status).toBe("insufficient_data");
    expect(select("16.32932532").rule?.perDoseMax).toBe("240");
    expect(select("43.09127515").rule?.perDoseMax).toBe("480");
    expect(select("43.1").status).toBe("insufficient_data");
    for (const rule of artifact.rules) {
      expect(select(rule.minWeightKg!).rule?.ruleId).toBe(rule.ruleId);
      expect(select(rule.maxWeightKg!).rule?.ruleId).toBe(rule.ruleId);
    }
  });

  it("compares only the declared amount and explicit daily pattern", () => {
    const artifact = loadBasicMedicationArtifact("CO");
    const rule = selectMedicationDoseRule({ conceptCode: artifact.concept.conceptCode, route: "oral", ageDays: 1_825, weightKg: "12", indicationCode: null }, artifact.rules).rule!;
    const converted = convertMedicationConcentration({ presentation: artifact.presentation, quantity: "4.5", quantityUnit: "mL" });
    expect(converted.ingredients[0]?.amount).toBe("144");
    expect(compareMedicationPerDose({ amount: "144", unit: "mg", weightKg: "12", rule }).status).toBe("within");
    expect(compareMedicationPerDose({ amount: "160", unit: "mg", weightKg: "12", rule }).status).toBe("outside");
    expect(compareMedicationDailyExposure({ perDoseAmount: "144", perDoseUnit: "mg", frequency: { kind: "times_of_day", times: ["00:00", "06:00", "12:00", "18:00"] }, rule }).status).toBe("within");
    expect(compareMedicationDailyExposure({ perDoseAmount: "144", perDoseUnit: "mg", frequency: { kind: "times_of_day", times: ["08:00", "10:00", "14:00", "18:00"] }, rule }).status).toBe("outside");
    expect(compareMedicationDailyExposure({ perDoseAmount: "144", perDoseUnit: "mg", frequency: { kind: "as_needed", label: "when needed" }, rule }).status).toBe("requires_professional_review");
  });

  it("contains no recommendation, alternative dose, or administration authorization", () => {
    const serialized = JSON.stringify([loadBasicMedicationArtifact("CO"), loadBasicMedicationArtifact("US")]);
    expect(serialized).not.toMatch(/safeToAdminister|recommendedDose|alternativeDose|safe to (?:give|administer)|prescrib/i);
  });
});
