import { describe, expect, it } from "vitest";

import { loadWhoDataset } from "../../../src/clinical/anthropometry/who-dataset.ts";

describe("WHO growth dataset", () => {
  it("loads the canonical manifest and verifies its digest", () => {
    const dataset = loadWhoDataset();

    expect(dataset.manifest.datasetKey).toBe("WHO_2006");
    expect(dataset.manifest.rowCount).toBeGreaterThan(100);
    expect(dataset.manifest.normalizedDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(dataset.rows)).toBe(true);
  });

  it("looks up exact sex, indicator, and month rows", () => {
    const row = loadWhoDataset().lookup({ indicator: "weight_for_age", sex: "male", ageMonths: 0 });

    expect(row?.l).toBe("0.3487");
    expect(row?.m).toBe("3.3464");
    expect(row?.s).toBe("0.14602");
  });

  it("rejects a tampered expected digest", () => {
    expect(() => loadWhoDataset("0".repeat(64))).toThrowError("WHO_DATASET_DIGEST_MISMATCH");
  });
});
