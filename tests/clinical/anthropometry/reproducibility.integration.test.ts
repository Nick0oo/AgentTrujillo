import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculatePercentile } from "../../../src/clinical/anthropometry/percentile.ts";
import { assessGrowth } from "../../../src/clinical/anthropometry/growth-assessment.ts";
import { selectGrowthStandard } from "../../../src/clinical/anthropometry/standard-selector.ts";
import { loadCdcDataset } from "../../../src/clinical/anthropometry/cdc-dataset.ts";
import { loadWhoDataset } from "../../../src/clinical/anthropometry/who-dataset.ts";

const manifest = JSON.parse(readFileSync(new URL("../../fixtures/growth/reproducibility-manifest.json", import.meta.url), "utf8")) as {
  datasets: Record<string, { normalizedDigest: string; rowCount: number }>;
};

function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("growth reproducibility manifest", () => {
  it("binds the packaged WHO/CDC assets to their row counts and digests", () => {
    const who = loadWhoDataset();
    const cdc = loadCdcDataset();

    expect(who.manifest.normalizedDigest).toBe(manifest.datasets.WHO_2006.normalizedDigest);
    expect(who.rows).toHaveLength(manifest.datasets.WHO_2006.rowCount);
    expect(cdc.manifest.normalizedDigest).toBe(manifest.datasets.CDC_2000.normalizedDigest);
    expect(cdc.rows).toHaveLength(manifest.datasets.CDC_2000.rowCount);
    expect(cdc.extendedBmi.manifest.normalizedDigest).toBe(manifest.datasets.CDC_2022_EXTENDED_BMI.normalizedDigest);
    expect(cdc.extendedBmi.rows).toHaveLength(manifest.datasets.CDC_2022_EXTENDED_BMI.rowCount);
  });

  it("keeps selection, status, and numerical bytes stable across repeated processes", () => {
    const inputs = [
      {
        measurementId: "repro-who",
        measurementType: "weight" as const,
        normalizedValue: "3.3464",
        normalizedUnit: "kg" as const,
        sex: "male" as const,
        countryCode: "CO",
        chronologicalAgeDays: 0,
        correctedAge: null,
        occurredAt: "2026-08-16T12:00:00.000Z",
        timeZone: "America/Bogota",
      },
      {
        measurementId: "repro-cdc",
        measurementType: "weight" as const,
        normalizedValue: "12",
        normalizedUnit: "kg" as const,
        sex: "female" as const,
        countryCode: "US",
        chronologicalAgeDays: 730,
        correctedAge: null,
        occurredAt: "2026-08-16T12:00:00.000Z",
        timeZone: "America/Bogota",
      },
    ];
    const first = inputs.map((input) => assessGrowth(input));
    const second = inputs.map((input) => assessGrowth(input));

    expect(canonicalDigest(first)).toBe(canonicalDigest(second));
    expect(first[0]).toMatchObject({ status: "calculated", standard: { datasetKey: "WHO_2006" }, zScore: { canonical: "0" }, percentile: { canonical: "50" } });
    expect(first[1].standard?.datasetKey).toBe("CDC_2000");
  });

  it("proves boundary and tail contracts independently of the assessment composer", () => {
    expect(selectGrowthStandard({ countryCode: "US", sex: "female", measurementType: "weight", chronologicalAgeDays: 729, correctedAge: null }).standard?.datasetKey).toBe("WHO_2006");
    expect(selectGrowthStandard({ countryCode: "US", sex: "female", measurementType: "weight", chronologicalAgeDays: 730, correctedAge: null }).standard?.datasetKey).toBe("CDC_2000");
    expect(calculatePercentile("20").percentile?.canonical).toBe("100");
  });
});
