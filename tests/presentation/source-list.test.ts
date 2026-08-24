import { describe, expect, it } from "vitest";

import { createCitationHandle } from "../../agent/lib/runtime/safe-to-model";
import {
  SOURCE_LIST_WIDGET_SCHEMA,
  SourceListPresentationError,
  presentSourceList,
} from "../../src/presentation/source-list";

const WHO_DIGEST = "a".repeat(64);
const PAI_DIGEST = "b".repeat(64);
const PRIVATE_DIGEST = "c".repeat(64);
const PACKAGE_DIGEST = "d".repeat(64);

function publicEntry(overrides: Record<string, unknown> = {}): any {
  const toolId = "generate_vaccination_card" as const;
  const referenceCode = "who-growth-2026";
  const sourceDigest = WHO_DIGEST;
  return {
    kind: "public_clinical_source",
    citationHandle: createCitationHandle(toolId, { sourceDigest, referenceCode }),
    toolId,
    referenceCode,
    title: "WHO Child Growth Standards",
    jurisdiction: "GLOBAL",
    versionLabel: "2026.1",
    versionDate: "2026-01-15",
    effectiveFrom: "2026-01-15",
    effectiveUntil: null,
    accessedOn: "2026-08-23",
    sourceDigest,
    packageDigests: [PACKAGE_DIGEST],
    current: true,
    revoked: false,
    canonicalUrl: "https://www.who.int/tools/child-growth-standards?ID=4908&utm_source=test",
    ...overrides,
  };
}

function paiEntry(overrides: Record<string, unknown> = {}): any {
  const toolId = "generate_vaccination_card" as const;
  const referenceCode = "co-pai-2026";
  const sourceDigest = PAI_DIGEST;
  return publicEntry({
    citationHandle: createCitationHandle(toolId, { sourceDigest, referenceCode }),
    toolId,
    referenceCode,
    title: "Minsalud PAI 2026",
    jurisdiction: "CO",
    versionLabel: "PAI-2026",
    versionDate: "2026-01-01",
    effectiveFrom: "2026-01-01",
    sourceDigest,
    canonicalUrl: "https://www.minsalud.gov.co/salud/publica/Vacunacion/Paginas/pai.aspx",
    ...overrides,
  });
}

function privateEntry(overrides: Record<string, unknown> = {}): any {
  const toolId = "search_child_clinical_memory" as const;
  const referenceCode = "memory-confirmed";
  const sourceDigest = PRIVATE_DIGEST;
  return {
    kind: "private_evidence",
    citationHandle: createCitationHandle(toolId, { sourceDigest, referenceCode }),
    toolId,
    referenceCode,
    title: "Confirmed private caregiver record",
    jurisdiction: "CO",
    versionLabel: "confirmed-fact-v1",
    versionDate: "2026-08-20",
    effectiveFrom: null,
    effectiveUntil: null,
    accessedOn: "2026-08-23",
    sourceDigest,
    packageDigests: [],
    current: true,
    revoked: false,
    ...overrides,
  };
}

describe("presentSourceList", () => {
  it("maps trusted handles to a strict accessible v1 source list and strips tracking", () => {
    const source = publicEntry();
    const widget = presentSourceList([source.citationHandle], [source], "es-CO");

    expect(SOURCE_LIST_WIDGET_SCHEMA.safeParse(widget).success).toBe(true);
    expect(widget).toMatchObject({
      kind: "source_list",
      version: "sources.list.v1",
      data: {
        locale: "es-CO",
        sources: [{
          id: "source-001",
          citationHandle: source.citationHandle,
          visibility: "public",
          title: "WHO Child Growth Standards",
          jurisdiction: { code: "GLOBAL", label: "Global" },
          version: { label: "2026.1", date: "2026-01-15" },
          effective: { from: "2026-01-15", until: null },
          accessed: { date: "2026-08-23" },
          link: {
            kind: "public_https",
            href: "https://www.who.int/tools/child-growth-standards?ID=4908",
          },
          trustedMetadata: {
            toolId: "generate_vaccination_card",
            referenceCode: "who-growth-2026",
            sourceDigest: WHO_DIGEST,
            packageDigests: [PACKAGE_DIGEST],
          },
        }],
      },
    });
    expect(widget.data.fallbackText).toContain("Fecha efectiva: 2026-01-15");
    expect(widget.data.fallbackText).toContain("Consultada: 2026-08-23");
    expect(widget.data.fallbackText).not.toContain("utm_source");
    expect(Object.isFrozen(widget)).toBe(true);
  });

  it("renders private evidence as a non-clickable label and omits artifact transport", () => {
    const source = privateEntry();
    const widget = presentSourceList([source.citationHandle], [source], "en-US");

    expect(widget.data.sources[0]).toMatchObject({
      visibility: "private",
      title: "Confirmed private caregiver record",
      link: { kind: "not_clickable", href: null, label: "Private source" },
    });
    const serialized = JSON.stringify(widget);
    expect(serialized).not.toMatch(/bucket|objectPath|signed|ticket|download/iu);
    expect(serialized).not.toContain("https://");
  });

  it("deduplicates requested handles and registry rows, then sorts deterministically", () => {
    const who = publicEntry();
    const pai = paiEntry();
    const first = presentSourceList(
      [who.citationHandle, pai.citationHandle, who.citationHandle],
      [who, pai, structuredClone(who)],
      "es-CO",
    );
    const second = presentSourceList(
      [pai.citationHandle, who.citationHandle],
      [structuredClone(pai), structuredClone(who)],
      "es-CO",
    );

    expect(first).toEqual(second);
    expect(first.data.sources.map(({ title }) => title)).toEqual([
      "Minsalud PAI 2026",
      "WHO Child Growth Standards",
    ]);
    expect(first.data.sources.map(({ id }) => id)).toEqual(["source-001", "source-002"]);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///private/document.pdf",
    "http://www.who.int/tools/child-growth-standards",
    "https://evil.example/redirect",
    "https://user:password@www.who.int/private",
    "https://www.who.int/source?token=secret-value",
    "https://www.who.int/source?redirect=https%3A%2F%2Fevil.example",
    "https://www.who.int/source#private-fragment",
  ])("rejects unsafe public canonical URL %s", (canonicalUrl) => {
    const source = publicEntry({ canonicalUrl });
    expect(() => presentSourceList([source.citationHandle], [source], "es-CO"))
      .toThrow(SourceListPresentationError);
  });

  it("rejects a URL or private path attached to private evidence", () => {
    const source = privateEntry({ canonicalUrl: "https://www.who.int/source" });
    expect(() => presentSourceList([source.citationHandle], [source], "en-US"))
      .toThrow(SourceListPresentationError);
    const path = privateEntry({ objectPath: "clinical-sources/private.pdf" });
    expect(() => presentSourceList([path.citationHandle], [path], "en-US"))
      .toThrow(SourceListPresentationError);
  });

  it("rejects unknown handles, handle/source drift and conflicting registry rows", () => {
    const source = publicEntry();
    const unknown = `citation:v1:${"f".repeat(64)}`;
    expect(() => presentSourceList([unknown], [source], "es-CO"))
      .toThrow(SourceListPresentationError);
    expect(() => presentSourceList([source.citationHandle], [{ ...source, sourceDigest: PAI_DIGEST }], "es-CO"))
      .toThrow(SourceListPresentationError);
    expect(() => presentSourceList(
      [source.citationHandle],
      [source, { ...source, title: "Conflicting title" }],
      "es-CO",
    )).toThrow(SourceListPresentationError);
  });

  it("rejects stale, revoked, malformed-date, unsafe-title and locale drift", () => {
    for (const source of [
      publicEntry({ current: false }),
      publicEntry({ revoked: true }),
      publicEntry({ effectiveUntil: "2025-12-31" }),
      publicEntry({ accessedOn: "2026-02-30" }),
      publicEntry({ title: "<script>unsafe</script>" }),
    ]) {
      expect(() => presentSourceList([source.citationHandle], [source], "es-CO"))
        .toThrow(SourceListPresentationError);
    }
    expect(() => presentSourceList([], [], "es-MX")).toThrow(SourceListPresentationError);
  });

  it("bounds the list and emits no clinician, emergency or arbitrary-action surface", () => {
    const source = publicEntry();
    expect(() => presentSourceList(Array.from({ length: 33 }, (_, index) => `citation:v1:${index.toString(16).padStart(64, "0")}`), [source], "es-CO"))
      .toThrow(SourceListPresentationError);
    const serialized = JSON.stringify(presentSourceList([source.citationHandle], [source], "es-CO"));
    expect(serialized).not.toMatch(/book|schedule|contact|notify|alert|transfer|phone|map|onClick|diagnos|prescri/iu);
  });
});
