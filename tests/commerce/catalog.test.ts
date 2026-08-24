import { describe, expect, it } from "vitest";

import {
  INTERNAL_CATALOG_RELEASE,
  defineCatalogRelease,
  getPlanCapabilityGrants,
  resolveCatalogProduct,
  type CatalogReleaseDefinition,
} from "../../src/commerce/catalog";

const START = "2026-08-23T00:00:00.000Z";

function definition(overrides: Partial<CatalogReleaseDefinition> = {}): CatalogReleaseDefinition {
  return {
    schemaVersion: "commerce-catalog.v1",
    version: "synthetic-test-v1",
    effectiveFrom: START,
    effectiveUntil: null,
    plans: [
      { code: "free", capabilities: [] },
      {
        code: "premium",
        capabilities: [
          { capability: "advanced_ai", limit: { kind: "unlimited" } },
          { capability: "multi_child", limit: { kind: "unlimited" } },
          { capability: "reports", limit: { kind: "unlimited" } },
          { capability: "reminders", limit: { kind: "unlimited" } },
        ],
      },
    ],
    mappings: [
      {
        mappingId: "stripe-co-web-test",
        plan: "premium",
        provider: "stripe",
        environment: "test",
        country: "CO",
        channel: "web",
        activeFrom: START,
        activeUntil: null,
        aliases: [
          {
            productId: "synthetic.stripe.premium.co",
            variant: { kind: "price", id: "synthetic.stripe.monthly.co" },
          },
        ],
      },
    ],
    transitions: [
      { from: "free", to: "premium", kind: "upgrade" },
      { from: "premium", to: "free", kind: "downgrade" },
    ],
    ...overrides,
  };
}

describe("provider-neutral commerce catalog", () => {
  it("builds a deterministic deeply immutable release with atomic capability grants", () => {
    const release = defineCatalogRelease(definition());
    const reordered = defineCatalogRelease(definition({
      plans: [...definition().plans].reverse(),
      transitions: [...definition().transitions].reverse(),
    }));

    expect(release.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered.checksum).toBe(release.checksum);
    expect(defineCatalogRelease(definition({ version: "synthetic-test-v2" })).checksum)
      .not.toBe(release.checksum);
    expect(Object.isFrozen(release)).toBe(true);
    expect(Object.isFrozen(release.plans)).toBe(true);
    expect(Object.isFrozen(release.plans[1]?.capabilities)).toBe(true);
    expect(getPlanCapabilityGrants(release, "free")).toEqual([]);
    expect(getPlanCapabilityGrants(release, "premium")).toEqual([
      { capability: "advanced_ai", limit: { kind: "unlimited" } },
      { capability: "multi_child", limit: { kind: "unlimited" } },
      { capability: "reminders", limit: { kind: "unlimited" } },
      { capability: "reports", limit: { kind: "unlimited" } },
    ]);
  });

  it("resolves only an exact active provider/environment/country/channel alias", () => {
    const release = defineCatalogRelease(definition());
    const result = resolveCatalogProduct(release, {
      provider: "stripe",
      environment: "test",
      country: "CO",
      channel: "web",
      productId: "synthetic.stripe.premium.co",
      variant: { kind: "price", id: "synthetic.stripe.monthly.co" },
      at: "2026-08-23T12:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      catalogVersion: "synthetic-test-v1",
      catalogChecksum: release.checksum,
      mappingId: "stripe-co-web-test",
      plan: "premium",
      capabilities: getPlanCapabilityGrants(release, "premium"),
    });
  });

  it.each([
    ["unknown product", { productId: "synthetic.stripe.unknown.co" }],
    ["production mix", { environment: "production" as const }],
    ["country mix", { country: "US" as const }],
    ["channel mix", { channel: "ios" as const }],
    ["variant mix", { variant: { kind: "price" as const, id: "synthetic.stripe.annual.co" } }],
    ["provider mix", { provider: "apple" as const }],
  ])("fails closed for %s", (_name, override) => {
    const result = resolveCatalogProduct(defineCatalogRelease(definition()), {
      provider: "stripe",
      environment: "test",
      country: "CO",
      channel: "web",
      productId: "synthetic.stripe.premium.co",
      variant: { kind: "price", id: "synthetic.stripe.monthly.co" },
      at: "2026-08-23T12:00:00.000Z",
      ...override,
    });

    expect(result).toEqual({ ok: false, code: "CATALOG_PRODUCT_UNAVAILABLE" });
  });

  it("fails closed after a mapping retires", () => {
    const mapping = definition().mappings[0];
    if (!mapping) throw new Error("fixture");
    const release = defineCatalogRelease(definition({
      mappings: [{ ...mapping, activeUntil: "2026-08-24T00:00:00.000Z" }],
    }));

    expect(resolveCatalogProduct(release, {
      provider: "stripe", environment: "test", country: "CO", channel: "web",
      productId: "synthetic.stripe.premium.co",
      variant: { kind: "price", id: "synthetic.stripe.monthly.co" },
      at: "2026-08-24T00:00:00.000Z",
    })).toEqual({ ok: false, code: "CATALOG_PRODUCT_UNAVAILABLE" });
  });

  it("rejects overlaps, invalid provider variants, unknown plans, and duplicate capabilities", () => {
    const mapping = definition().mappings[0];
    if (!mapping) throw new Error("fixture");

    expect(() => defineCatalogRelease(definition({
      mappings: [mapping, { ...mapping, mappingId: "overlap" }],
    }))).toThrowError("CATALOG_INVALID");
    expect(() => defineCatalogRelease(definition({
      mappings: [{ ...mapping, provider: "apple", channel: "ios" }],
    }))).toThrowError("CATALOG_INVALID");
    expect(() => defineCatalogRelease(definition({
      mappings: [{ ...mapping, plan: "unknown" as never }],
    }))).toThrowError("CATALOG_INVALID");
    expect(() => defineCatalogRelease(definition({
      plans: [definition().plans[0]!, {
        code: "premium",
        capabilities: [
          { capability: "reports", limit: { kind: "unlimited" } },
          { capability: "reports", limit: { kind: "unlimited" } },
        ],
      }],
    }))).toThrowError("CATALOG_INVALID");
  });

  it("rejects authority, flags, prices, display copy, and unknown trust-boundary fields", () => {
    expect(() => defineCatalogRelease({
      ...definition(),
      careSpaceId: "00000000-0000-4000-8000-000000000001",
      flags: { premium: true },
      price: 1,
      displayCopy: "Premium",
    } as never)).toThrowError("CATALOG_INVALID");
    expect(() => defineCatalogRelease(definition({
      transitions: [{ from: "free", to: "premium", kind: "downgrade" }],
    }))).toThrowError("CATALOG_INVALID");
    expect(resolveCatalogProduct(defineCatalogRelease(definition()), {
      provider: "stripe", environment: "test", country: "CO", channel: "web",
      productId: "synthetic.stripe.premium.co",
      variant: { kind: "price", id: "synthetic.stripe.monthly.co" },
      at: "2026-08-23T12:00:00.000Z",
      childId: "00000000-0000-4000-8000-000000000002",
    } as never)).toEqual({ ok: false, code: "CATALOG_PRODUCT_UNAVAILABLE" });
    expect(resolveCatalogProduct(defineCatalogRelease(definition()), {
      provider: "stripe", environment: "test", country: "CO", channel: "web",
      productId: "x".repeat(201), variant: null, at: "2026-08-23T12:00:00.000Z",
    })).toEqual({ ok: false, code: "CATALOG_PRODUCT_UNAVAILABLE" });
  });

  it("ships only synthetic test mappings while keeping safety outside the paywall catalog", () => {
    expect(INTERNAL_CATALOG_RELEASE.mappings).toHaveLength(6);
    expect(INTERNAL_CATALOG_RELEASE.mappings.every((mapping) => mapping.environment === "test")).toBe(true);
    expect(INTERNAL_CATALOG_RELEASE.mappings.every((mapping) =>
      mapping.aliases.every((alias) => alias.productId.startsWith("synthetic.")))).toBe(true);
    expect(INTERNAL_CATALOG_RELEASE.plans.map((plan) => plan.code)).toEqual(["free", "premium"]);
    expect(INTERNAL_CATALOG_RELEASE.transitions).toEqual([
      { from: "free", to: "premium", kind: "upgrade" },
      { from: "premium", to: "free", kind: "downgrade" },
    ]);
    expect(JSON.stringify(INTERNAL_CATALOG_RELEASE)).not.toMatch(
      /careSpaceId|childId|guardianId|featureFlag|priceAmount|displayCopy|emergency|red_flag/i,
    );
    expect(resolveCatalogProduct(INTERNAL_CATALOG_RELEASE, {
      provider: "stripe", environment: "production", country: "CO", channel: "web",
      productId: "synthetic.stripe.premium.co",
      variant: { kind: "price", id: "synthetic.stripe.monthly.co" },
      at: "2026-08-23T12:00:00.000Z",
    })).toEqual({ ok: false, code: "CATALOG_PRODUCT_UNAVAILABLE" });
  });
});
