import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Manifest = Readonly<{
  schemaVersion: string;
  status: string;
  countries: Record<"CO" | "US", { sources: readonly { id: string; uri: string; artifactSha256: string | null; capture: string }[] }>;
}>;

const manifest = JSON.parse(readFileSync(new URL("../../fixtures/immunization/official-source-manifest.json", import.meta.url), "utf8")) as Manifest;

describe("official immunization source manifest", () => {
  it("binds independent official source sets without activating a clinical package", () => {
    expect(manifest.schemaVersion).toBe("immunization-official-source-manifest-v1");
    expect(manifest.status).toBe("source-bound-not-clinically-approved");
    for (const country of ["CO", "US"] as const) {
      expect(manifest.countries[country].sources.length).toBeGreaterThan(0);
      expect(manifest.countries[country].sources.every((source) => new URL(source.uri).protocol === "https:")).toBe(true);
      expect(manifest.countries[country].sources.every((source) => source.id.length > 0 && source.capture.length > 0)).toBe(true);
    }
    expect(manifest.countries.CO.sources.every((source) => new URL(source.uri).hostname.endsWith("minsalud.gov.co"))).toBe(true);
    expect(manifest.countries.US.sources.every((source) => new URL(source.uri).hostname === "www.cdc.gov")).toBe(true);
  });

  it("requires immutable byte digests where an artifact was captured and records live-page recheck otherwise", () => {
    const colombia = manifest.countries.CO.sources;
    expect(colombia.filter((source) => source.capture === "byte-hashed").every((source) => /^[a-f0-9]{64}$/.test(source.artifactSha256 ?? ""))).toBe(true);
    const unitedStates = manifest.countries.US.sources;
    expect(unitedStates.every((source) => source.capture === "official-page-current-status-rechecked")).toBe(true);
  });
});
