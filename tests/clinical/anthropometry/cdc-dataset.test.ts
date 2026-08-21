import { describe, expect, it } from "vitest";

import { loadCdcDataset } from "../../../src/clinical/anthropometry/cdc-dataset.ts";

describe("CDC growth dataset", () => {
  it("keeps CDC 2000 and extended BMI identities separate", () => {
    const dataset = loadCdcDataset();

    expect(dataset.manifest.datasetKey).toBe("CDC_2000");
    expect(dataset.manifest.rowCount).toBeGreaterThan(1000);
    expect(dataset.extendedBmi.manifest.datasetKey).toBe("CDC_2022_EXTENDED_BMI");
    expect(dataset.extendedBmi.manifest.rowCount).toBeGreaterThan(400);
  });

  it("looks up documented CDC LMS rows by exact age and sex", () => {
    const row = loadCdcDataset().lookup({ indicator: "weight_for_age", sex: "male", ageMonths: "24" });

    expect(row?.l).toBe("-0.20615245");
    expect(row?.m).toBe("12.6707633");
    expect(row?.s).toBe("0.108125811");
  });

  it("does not collapse overlapping infant and child chart rows", () => {
    const dataset = loadCdcDataset();

    expect(dataset.lookup({ indicator: "weight_for_age", sex: "female", ageMonths: "24.5" })).toBeNull();
    expect(dataset.lookup({ indicator: "weight_for_age", sex: "female", ageMonths: "24.5", sourceFile: "cdc-wtage.csv" })?.m).toBe("12.13455523");
    expect(dataset.lookup({ indicator: "weight_for_age", sex: "female", ageMonths: "24.5", sourceFile: "cdc-wtageinf.csv" })?.m).toBe("12.13455528");
  });

  it("rejects a tampered expected digest", () => {
    expect(() => loadCdcDataset("0".repeat(64))).toThrowError("CDC_DATASET_DIGEST_MISMATCH");
  });
});
