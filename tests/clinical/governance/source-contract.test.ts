import { describe, expect, it } from "vitest";

import {
  clinicalSourceCandidateSchema,
  isPrimaryAuthority,
  validateClinicalSource,
} from "../../../src/clinical/governance/source-policy";
import type { ClinicalSourceCandidate } from "../../../src/clinical/governance/source-types";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);

const baseCandidate: ClinicalSourceCandidate = {
  authority: "MINSALUD_PAI",
  jurisdiction: "CO",
  domain: "immunization",
  title: " Synthetic PAI title ",
  sourceUri: "https://vacunacion.minsalud.gov.co/RT/Paginas/programa-ampliado-de-inmunizaciones-pai.aspx",
  citation: "  Synthetic citation; do not normalize  ",
  publishedAt: "2025-01-15",
  retrievedAt: "2026-08-15T12:00:00.000Z",
  effectiveFrom: "2025-01-01",
  effectiveUntil: "2026-12-31",
  license: "Synthetic authority metadata",
  artifactSha256: DIGEST,
  status: "candidate",
};

function validate(candidate: unknown, options: Record<string, unknown> = {}) {
  return validateClinicalSource(candidate, { now: NOW, ...options });
}

describe("clinical source provenance contract", () => {
  it.each([
    ["Minsalud PAI", baseCandidate],
    ["CDC ACIP", {
      ...baseCandidate,
      authority: "CDC_ACIP",
      jurisdiction: "US",
      sourceUri: "https://www.cdc.gov/acip/vaccine-recommendations/index.html",
    }],
    ["WHO global standard", {
      ...baseCandidate,
      authority: "WHO",
      jurisdiction: "GLOBAL",
      sourceUri: "https://www.who.int/teams/immunization-vaccines-and-biologicals/policies/who-recommendations-for-routine-immunization---summary-tables",
    }],
  ])("accepts a traceable primary %s source", (_label, candidate) => {
    const result = validate(candidate);

    expect(result).toMatchObject({ ok: true, status: "accepted" });
    if (result.ok) {
      expect(result.source.sourceUri).toBe(candidate.sourceUri);
      expect(result.source.title).toBe(candidate.title);
      expect(result.source.citation).toBe(candidate.citation);
      expect(result.source.artifactSha256).toBe(DIGEST);
    }
  });

  it("normalizes authority codes without normalizing display data", () => {
    const result = validate({
      ...baseCandidate,
      authority: " minsalud/pai ",
    });

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.source.authority).toBe("MINSALUD_PAI");
      expect(result.source.title).toBe(baseCandidate.title);
      expect(result.source.citation).toBe(baseCandidate.citation);
      expect(result.source.sourceUri).toBe(baseCandidate.sourceUri);
    }
  });

  it("keeps GLOBAL explicit and never uses it as a country fallback", () => {
    expect(isPrimaryAuthority("WHO", "GLOBAL", "immunization")).toBe(true);
    expect(isPrimaryAuthority("WHO", "CO", "immunization")).toBe(false);
    expect(isPrimaryAuthority("MINSALUD_PAI", "GLOBAL", "immunization")).toBe(false);

    const countryFallback = validate({
      ...baseCandidate,
      authority: "WHO",
      jurisdiction: "CO",
      sourceUri: "https://www.who.int/teams/immunization-vaccines-and-biologicals/policies/who-recommendations-for-routine-immunization---summary-tables",
    });
    expect(countryFallback).toMatchObject({ ok: false, code: "AUTHORITY_JURISDICTION_MISMATCH" });
  });

  it("rejects secondary authorities", () => {
    const result = validate({
      ...baseCandidate,
      authority: "AAP",
      jurisdiction: "US",
      sourceUri: "https://www.aap.org/secondary-summary",
    });

    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_AUTHORITY" });
  });

  it("rejects a primary authority paired with a misleading hostname", () => {
    const result = validate({
      ...baseCandidate,
      authority: "CDC_ACIP",
      jurisdiction: "US",
      sourceUri: "https://cdc.gov.example.invalid/acip",
    });

    expect(result).toMatchObject({ ok: false, code: "SOURCE_HOST_MISMATCH" });
  });

  it("rejects non-HTTPS source URIs", () => {
    const result = validate({
      ...baseCandidate,
      sourceUri: "http://vacunacion.minsalud.gov.co/pai",
    });

    expect(result).toMatchObject({ ok: false, code: "SOURCE_URI_NOT_HTTPS" });
  });

  it("rejects malformed source URIs with a stable invalid code", () => {
    const result = validate({
      ...baseCandidate,
      sourceUri: "not a URI",
    });

    expect(result).toMatchObject({ ok: false, code: "SOURCE_URI_INVALID" });
  });

  it.each([
    ["missing digest", { artifactSha256: undefined }, "MISSING_ARTIFACT_DIGEST"],
    ["invalid digest", { artifactSha256: "A".repeat(64) }, "INVALID_ARTIFACT_DIGEST"],
    ["missing license", { license: undefined }, "MISSING_LICENSE"],
    ["blank license", { license: "   " }, "INVALID_LICENSE"],
  ])("rejects %s with a stable code", (_label, overrides, code) => {
    const result = validate({ ...baseCandidate, ...overrides });

    expect(result).toMatchObject({ ok: false, code });
  });

  it("rejects retrieval instants that are in the future", () => {
    const result = validate({
      ...baseCandidate,
      retrievedAt: "2026-08-16T12:00:01.000Z",
    });

    expect(result).toMatchObject({ ok: false, code: "RETRIEVAL_IN_FUTURE" });
  });

  it("rejects retrieval instants with impossible calendar dates", () => {
    const result = validate({
      ...baseCandidate,
      retrievedAt: "2026-02-30T12:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_RETRIEVAL_INSTANT" });
  });

  it("rejects invalid dates and reversed effective windows", () => {
    const badDate = validate({ ...baseCandidate, publishedAt: "2026-02-30" });
    const reversedWindow = validate({
      ...baseCandidate,
      effectiveFrom: "2026-12-31",
      effectiveUntil: "2026-01-01",
    });

    expect(badDate).toMatchObject({ ok: false, code: "INVALID_PUBLICATION_DATE" });
    expect(reversedWindow).toMatchObject({ ok: false, code: "INVALID_EFFECTIVE_WINDOW" });
  });

  it("rejects unsupported jurisdictions", () => {
    const result = validate({
      ...baseCandidate,
      jurisdiction: "MX",
    });

    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_JURISDICTION" });
  });

  it("does not coerce jurisdiction or domain identity fields", () => {
    const lowercaseJurisdiction = validate({
      ...baseCandidate,
      jurisdiction: "co",
    });
    const uppercaseDomain = validate({
      ...baseCandidate,
      domain: "IMMUNIZATION",
    });

    expect(lowercaseJurisdiction).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_JURISDICTION",
    });
    expect(uppercaseDomain).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_DOMAIN",
    });
  });

  it("rejects duplicate URI and retrieval identity without comparing display fields", () => {
    const first = validate(baseCandidate);
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;

    const duplicate = validate({
      ...baseCandidate,
      title: "A different untrusted title",
      citation: "A different untrusted citation",
      artifactSha256: OTHER_DIGEST,
    }, { existingSources: [first.source] });

    expect(duplicate).toMatchObject({ ok: false, code: "DUPLICATE_SOURCE_VERSION" });
  });

  it("permits a later retrieval of the same URI as a distinct captured version", () => {
    const first = validate(baseCandidate);
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;

    const later = validate({
      ...baseCandidate,
      retrievedAt: "2026-08-15T12:00:01.000Z",
      artifactSha256: OTHER_DIGEST,
    }, { existingSources: [first.source] });

    expect(later).toMatchObject({ ok: true, status: "accepted" });
  });

  it("marks retirement for review without mutating historical references", () => {
    const accepted = validate(baseCandidate);
    expect(accepted).toMatchObject({ ok: true, status: "accepted" });
    if (!accepted.ok) return;

    const retired = validate({ ...baseCandidate, status: "retired" });

    expect(retired).toMatchObject({ ok: true, status: "needs_review" });
    if (retired.ok) {
      expect(retired.source.status).toBe("retired");
      expect(accepted.source.status).toBe("candidate");
      expect(retired.source).not.toBe(accepted.source);
    }
  });

  it("exposes a strict schema without network or source-body access", () => {
    expect(clinicalSourceCandidateSchema.safeParse(baseCandidate).success).toBe(true);
    expect(clinicalSourceCandidateSchema.safeParse({
      ...baseCandidate,
      sourceUri: "https://cdc.gov.example.invalid/redirect?target=https://www.cdc.gov",
    }).success).toBe(true);
  });
});
