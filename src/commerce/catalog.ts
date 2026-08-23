import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

const internalPlanSchema = z.enum(["free", "premium"]);
const capabilitySchema = z.enum(["advanced_ai", "multi_child", "reports", "reminders"]);
const providerSchema = z.enum(["stripe", "apple", "google"]);
const environmentSchema = z.enum(["test", "production"]);
const countrySchema = z.enum(["CO", "US"]);
const channelSchema = z.enum(["web", "ios", "android"]);
const identifierSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
const instantSchema = z.string().datetime({ offset: true });

export type InternalPlan = z.infer<typeof internalPlanSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type CommerceProvider = z.infer<typeof providerSchema>;
export type CommerceEnvironment = z.infer<typeof environmentSchema>;
export type CatalogCountry = z.infer<typeof countrySchema>;
export type PurchaseChannel = z.infer<typeof channelSchema>;

export type UsageLimit =
  | Readonly<{ kind: "unlimited" }>
  | Readonly<{
    kind: "count";
    maximum: number;
    unit: "invocation" | "child" | "report" | "reminder";
    period: "day" | "month" | "entitlement";
  }>;

export type CapabilityGrant = Readonly<{
  capability: Capability;
  limit: UsageLimit;
}>;

export type ProviderVariant = Readonly<{
  kind: "price" | "base_plan";
  id: string;
}>;

export type ProviderProductAlias = Readonly<{
  productId: string;
  variant: ProviderVariant | null;
}>;

export type ProviderProductMapping = Readonly<{
  mappingId: string;
  plan: InternalPlan;
  provider: CommerceProvider;
  environment: CommerceEnvironment;
  country: CatalogCountry;
  channel: PurchaseChannel;
  activeFrom: string;
  activeUntil: string | null;
  aliases: readonly ProviderProductAlias[];
}>;

export type PlanDefinition = Readonly<{
  code: InternalPlan;
  capabilities: readonly CapabilityGrant[];
}>;

export type PlanTransition = Readonly<{
  from: InternalPlan;
  to: InternalPlan;
  kind: "upgrade" | "downgrade";
}>;

export type CatalogReleaseDefinition = Readonly<{
  schemaVersion: "commerce-catalog.v1";
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  plans: readonly PlanDefinition[];
  mappings: readonly ProviderProductMapping[];
  transitions: readonly PlanTransition[];
}>;

export type CatalogRelease = CatalogReleaseDefinition & Readonly<{ checksum: string }>;

export type ResolveCatalogProductInput = Readonly<{
  provider: CommerceProvider;
  environment: CommerceEnvironment;
  country: CatalogCountry;
  channel: PurchaseChannel;
  productId: string;
  variant: ProviderVariant | null;
  at: string;
}>;

export type CatalogProductResolution =
  | Readonly<{
    ok: true;
    catalogVersion: string;
    catalogChecksum: string;
    mappingId: string;
    plan: InternalPlan;
    capabilities: readonly CapabilityGrant[];
  }>
  | Readonly<{ ok: false; code: "CATALOG_PRODUCT_UNAVAILABLE" }>;

const usageLimitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }).strict(),
  z.object({
    kind: z.literal("count"),
    maximum: z.number().int().positive().max(1_000_000),
    unit: z.enum(["invocation", "child", "report", "reminder"]),
    period: z.enum(["day", "month", "entitlement"]),
  }).strict(),
]);

const capabilityGrantSchema = z.object({
  capability: capabilitySchema,
  limit: usageLimitSchema,
}).strict();

const variantSchema = z.object({
  kind: z.enum(["price", "base_plan"]),
  id: identifierSchema,
}).strict();

const aliasSchema = z.object({
  productId: identifierSchema,
  variant: variantSchema.nullable(),
}).strict();

const mappingSchema = z.object({
  mappingId: identifierSchema,
  plan: internalPlanSchema,
  provider: providerSchema,
  environment: environmentSchema,
  country: countrySchema,
  channel: channelSchema,
  activeFrom: instantSchema,
  activeUntil: instantSchema.nullable(),
  aliases: z.array(aliasSchema).min(1).max(32),
}).strict();

const planSchema = z.object({
  code: internalPlanSchema,
  capabilities: z.array(capabilityGrantSchema).max(capabilitySchema.options.length),
}).strict();

const transitionSchema = z.object({
  from: internalPlanSchema,
  to: internalPlanSchema,
  kind: z.enum(["upgrade", "downgrade"]),
}).strict();

const releaseDefinitionSchema = z.object({
  schemaVersion: z.literal("commerce-catalog.v1"),
  version: identifierSchema,
  effectiveFrom: instantSchema,
  effectiveUntil: instantSchema.nullable(),
  plans: z.array(planSchema).min(2).max(2),
  mappings: z.array(mappingSchema).max(128),
  transitions: z.array(transitionSchema).max(8),
}).strict();

const resolutionInputSchema = z.object({
  provider: providerSchema,
  environment: environmentSchema,
  country: countrySchema,
  channel: channelSchema,
  productId: identifierSchema,
  variant: variantSchema.nullable(),
  at: instantSchema,
}).strict();

const RELEASES = new WeakSet<object>();
const UNAVAILABLE = Object.freeze({
  ok: false as const,
  code: "CATALOG_PRODUCT_UNAVAILABLE" as const,
});

export class CatalogError extends Error {
  readonly code = "CATALOG_INVALID" as const;

  constructor() {
    super("CATALOG_INVALID");
    this.name = "CatalogError";
  }
}

function fail(): never {
  throw new CatalogError();
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail();
  return parsed;
}

function variantKey(variant: ProviderVariant | null): string {
  return variant ? `${variant.kind}:${variant.id}` : "none";
}

function aliasKey(alias: ProviderProductAlias): string {
  return `${alias.productId}:${variantKey(alias.variant)}`;
}

function mappingIdentity(mapping: ProviderProductMapping, alias: ProviderProductAlias): string {
  return [
    mapping.provider, mapping.environment, mapping.country, mapping.channel, aliasKey(alias),
  ].join(":");
}

function rangesOverlap(left: ProviderProductMapping, right: ProviderProductMapping): boolean {
  const leftEnd = left.activeUntil ? timestamp(left.activeUntil) : Number.POSITIVE_INFINITY;
  const rightEnd = right.activeUntil ? timestamp(right.activeUntil) : Number.POSITIVE_INFINITY;
  return timestamp(left.activeFrom) < rightEnd && timestamp(right.activeFrom) < leftEnd;
}

function validProviderShape(mapping: ProviderProductMapping): boolean {
  if (mapping.provider === "stripe") {
    return mapping.channel === "web"
      && mapping.aliases.every((alias) => alias.variant?.kind === "price");
  }
  if (mapping.provider === "apple") {
    return mapping.channel === "ios"
      && mapping.aliases.every((alias) => alias.variant === null);
  }
  return mapping.channel === "android"
    && mapping.aliases.every((alias) => alias.variant?.kind === "base_plan");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function normalize(definition: CatalogReleaseDefinition): CatalogReleaseDefinition {
  const plans = definition.plans.map((plan) => ({
    code: plan.code,
    capabilities: [...plan.capabilities]
      .map((grant) => ({ capability: grant.capability, limit: { ...grant.limit } }))
      .sort((left, right) => left.capability.localeCompare(right.capability)),
  })).sort((left, right) => left.code.localeCompare(right.code));
  const mappings = definition.mappings.map((mapping) => ({
    ...mapping,
    aliases: [...mapping.aliases]
      .map((alias) => ({
        productId: alias.productId,
        variant: alias.variant ? { ...alias.variant } : null,
      }))
      .sort((left, right) => aliasKey(left).localeCompare(aliasKey(right))),
  })).sort((left, right) => left.mappingId.localeCompare(right.mappingId));
  const transitions = [...definition.transitions]
    .map((transition) => ({ ...transition }))
    .sort((left, right) =>
      `${left.from}:${left.to}:${left.kind}`.localeCompare(`${right.from}:${right.to}:${right.kind}`));
  return {
    schemaVersion: definition.schemaVersion,
    version: definition.version,
    effectiveFrom: definition.effectiveFrom,
    effectiveUntil: definition.effectiveUntil,
    plans,
    mappings,
    transitions,
  };
}

function validateSemantics(definition: CatalogReleaseDefinition): void {
  const releaseStart = timestamp(definition.effectiveFrom);
  const releaseEnd = definition.effectiveUntil
    ? timestamp(definition.effectiveUntil)
    : Number.POSITIVE_INFINITY;
  if (releaseEnd <= releaseStart) fail();

  const planCodes = definition.plans.map((plan) => plan.code);
  if (new Set(planCodes).size !== planCodes.length
    || !planCodes.includes("free")
    || !planCodes.includes("premium")) fail();
  for (const plan of definition.plans) {
    const capabilities = plan.capabilities.map((grant) => grant.capability);
    if (new Set(capabilities).size !== capabilities.length) fail();
  }

  const mappingIds = definition.mappings.map((mapping) => mapping.mappingId);
  if (new Set(mappingIds).size !== mappingIds.length) fail();
  for (const mapping of definition.mappings) {
    const mappingStart = timestamp(mapping.activeFrom);
    const mappingEnd = mapping.activeUntil
      ? timestamp(mapping.activeUntil)
      : Number.POSITIVE_INFINITY;
    if (!planCodes.includes(mapping.plan)
      || !validProviderShape(mapping)
      || mappingStart < releaseStart
      || mappingEnd <= mappingStart
      || mappingEnd > releaseEnd
      || new Set(mapping.aliases.map(aliasKey)).size !== mapping.aliases.length) fail();
  }

  for (let leftIndex = 0; leftIndex < definition.mappings.length; leftIndex += 1) {
    const left = definition.mappings[leftIndex];
    if (!left) fail();
    for (let rightIndex = leftIndex + 1; rightIndex < definition.mappings.length; rightIndex += 1) {
      const right = definition.mappings[rightIndex];
      if (!right || !rangesOverlap(left, right)) continue;
      const leftIdentities = new Set(left.aliases.map((alias) => mappingIdentity(left, alias)));
      if (right.aliases.some((alias) => leftIdentities.has(mappingIdentity(right, alias)))) fail();
    }
  }

  const transitionKeys = new Set<string>();
  for (const transition of definition.transitions) {
    const key = `${transition.from}:${transition.to}`;
    const validKind = transition.from === "free" && transition.to === "premium"
      ? transition.kind === "upgrade"
      : transition.from === "premium" && transition.to === "free"
        ? transition.kind === "downgrade"
        : false;
    if (!validKind || transitionKeys.has(key)) fail();
    transitionKeys.add(key);
  }
}

export function defineCatalogRelease(input: CatalogReleaseDefinition): CatalogRelease {
  const parsed = releaseDefinitionSchema.safeParse(input);
  if (!parsed.success) fail();
  const normalized = normalize(parsed.data);
  validateSemantics(normalized);
  const checksum = createHash("sha256")
    .update(canonicalize(normalized), "utf8")
    .digest("hex");
  const release = deepFreeze({ ...normalized, checksum }) as CatalogRelease;
  RELEASES.add(release);
  return release;
}

export function getPlanCapabilityGrants(
  release: CatalogRelease,
  plan: InternalPlan,
): readonly CapabilityGrant[] {
  if (!RELEASES.has(release)) fail();
  const definition = release.plans.find((candidate) => candidate.code === plan);
  if (!definition) fail();
  return definition.capabilities;
}

function sameVariant(left: ProviderVariant | null, right: ProviderVariant | null): boolean {
  return left === null
    ? right === null
    : right !== null && left.kind === right.kind && left.id === right.id;
}

export function resolveCatalogProduct(
  release: CatalogRelease,
  input: ResolveCatalogProductInput,
): CatalogProductResolution {
  if (!RELEASES.has(release)) return UNAVAILABLE;
  const parsed = resolutionInputSchema.safeParse(input);
  if (!parsed.success) return UNAVAILABLE;
  const at = timestamp(parsed.data.at);
  const releaseStart = timestamp(release.effectiveFrom);
  const releaseEnd = release.effectiveUntil
    ? timestamp(release.effectiveUntil)
    : Number.POSITIVE_INFINITY;
  if (at < releaseStart || at >= releaseEnd) return UNAVAILABLE;

  const matches = release.mappings.filter((mapping) => {
    if (mapping.provider !== parsed.data.provider
      || mapping.environment !== parsed.data.environment
      || mapping.country !== parsed.data.country
      || mapping.channel !== parsed.data.channel
      || at < timestamp(mapping.activeFrom)
      || (mapping.activeUntil !== null && at >= timestamp(mapping.activeUntil))) return false;
    return mapping.aliases.some((alias) =>
      alias.productId === parsed.data.productId && sameVariant(alias.variant, parsed.data.variant));
  });
  const mapping = matches.length === 1 ? matches[0] : undefined;
  if (!mapping) return UNAVAILABLE;
  return Object.freeze({
    ok: true,
    catalogVersion: release.version,
    catalogChecksum: release.checksum,
    mappingId: mapping.mappingId,
    plan: mapping.plan,
    capabilities: getPlanCapabilityGrants(release, mapping.plan),
  });
}

const COUNTRIES = ["CO", "US"] as const;
const SYNTHETIC_MAPPINGS: readonly ProviderProductMapping[] = COUNTRIES.flatMap((country) => {
  const suffix = country.toLowerCase();
  return [
    {
      mappingId: `test.stripe.web.${suffix}.premium`,
      plan: "premium", provider: "stripe", environment: "test", country, channel: "web",
      activeFrom: "2026-08-23T00:00:00.000Z", activeUntil: null,
      aliases: [{
        productId: `synthetic.stripe.agent_trujillo.premium.${suffix}`,
        variant: { kind: "price", id: `synthetic.stripe.agent_trujillo.premium.${suffix}.monthly` },
      }],
    },
    {
      mappingId: `test.apple.ios.${suffix}.premium`,
      plan: "premium", provider: "apple", environment: "test", country, channel: "ios",
      activeFrom: "2026-08-23T00:00:00.000Z", activeUntil: null,
      aliases: [{
        productId: `synthetic.apple.agenttrujillo.premium.${suffix}`,
        variant: null,
      }],
    },
    {
      mappingId: `test.google.android.${suffix}.premium`,
      plan: "premium", provider: "google", environment: "test", country, channel: "android",
      activeFrom: "2026-08-23T00:00:00.000Z", activeUntil: null,
      aliases: [{
        productId: `synthetic.google.agenttrujillo.premium.${suffix}`,
        variant: { kind: "base_plan", id: "synthetic-monthly" },
      }],
    },
  ] satisfies ProviderProductMapping[];
});

export const INTERNAL_CATALOG_RELEASE = defineCatalogRelease({
  schemaVersion: "commerce-catalog.v1",
  version: "2026-08-23.synthetic-test-v1",
  effectiveFrom: "2026-08-23T00:00:00.000Z",
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
  mappings: SYNTHETIC_MAPPINGS,
  transitions: [
    { from: "free", to: "premium", kind: "upgrade" },
    { from: "premium", to: "free", kind: "downgrade" },
  ],
});
