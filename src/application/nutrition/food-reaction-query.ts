import { createHash } from "node:crypto";

import {
  hasPermission,
  isAuthorizedChildScopeActive,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const REACTION_TYPES = ["allergy", "intolerance", "preference", "avoidance"] as const;
const SEVERITIES = ["mild", "moderate", "severe", "unknown"] as const;
const STATUSES = ["declared", "confirmed", "resolved", "entered_in_error"] as const;
const PROVENANCE_TYPES = ["guardian", "professional", "import", "document", "chat"] as const;
const CHILD_PERMISSIONS = ["read", "record", "manage_documents", "manage_medication", "manage_guardians"] as const;

export type FoodReactionCutoff = Date | string;
export type FoodReactionType = (typeof REACTION_TYPES)[number];
export type FoodReactionSeverity = (typeof SEVERITIES)[number];
export type FoodReactionStatus = (typeof STATUSES)[number];
export type FoodReactionProvenanceType = (typeof PROVENANCE_TYPES)[number];
export type FoodReactionLifecycle = "active" | "resolved" | "entered_in_error";
export type FoodReactionUncertainty =
  | "unmapped_food"
  | "supersession_unavailable"
  | "confirmation_uncertain"
  | "duplicate_identity"
  | "conflicting_evidence";

/**
 * The repository adapter must project only these columns from
 * `child_food_reactions`; notes and recorded_by are intentionally absent.
 */
export type FoodReactionRow = Readonly<{
  id: string;
  careSpaceId: string;
  childId: string;
  substanceName: string;
  normalizedCode: string | null;
  reactionType: string;
  severity: string | null;
  status: string;
  provenanceType: string;
  observedOn: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type FoodReactionIdentity = Readonly<{
  id: string;
  foodLabel: string;
  foodCode: string | null;
  mapping: "normalized" | "unmapped";
}>;

export type FoodReactionDeclaration = Readonly<{
  reactionType: FoodReactionType;
  severity: FoodReactionSeverity | null;
  status: FoodReactionStatus;
  lifecycle: FoodReactionLifecycle;
}>;

export type FoodReactionConfirmation = Readonly<{
  status: "declared" | "confirmed" | "unknown";
}>;

export type FoodReactionProvenance = Readonly<{
  provenanceType: FoodReactionProvenanceType;
  observedOn: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type FoodReactionEvidence = Readonly<{
  identity: FoodReactionIdentity;
  declaration: FoodReactionDeclaration;
  confirmation: FoodReactionConfirmation;
  supersession: "unknown";
  uncertainty: readonly FoodReactionUncertainty[];
  provenance: FoodReactionProvenance;
}>;

export type FoodReactionAccessRevalidator = Readonly<{
  validate: (scope: AuthorizedChildScope, currentInstant: string) => Promise<AuthorizedChildScope | null>;
}>;

export type FoodReactionRepository = Readonly<{
  getReactions: (scope: AuthorizedChildScope, cutoff: string) => Promise<readonly FoodReactionRow[] | null>;
}>;

export type FoodReactionQuerySuccess = Readonly<{
  ok: true;
  status: "available";
  reactions: readonly FoodReactionEvidence[];
  digest: Sha256Hex;
}>;

export type FoodReactionQueryFailure = Readonly<{
  ok: false;
  status: "unavailable";
  code: "FOOD_REACTIONS_UNAVAILABLE";
}>;

export type FoodReactionQueryResult = FoodReactionQuerySuccess | FoodReactionQueryFailure;

export type FoodReactionQueryDependencies = Readonly<{
  accessRevalidator: FoodReactionAccessRevalidator;
  repository: FoodReactionRepository;
}>;

export type FoodReactionQueryOptions = Readonly<{
  now?: () => Date;
}>;

export interface FoodReactionQuery {
  execute(scope: AuthorizedChildScope, cutoff: FoodReactionCutoff): Promise<FoodReactionQueryResult>;
}

const FAILURE: FoodReactionQueryFailure = Object.freeze({
  ok: false as const,
  status: "unavailable" as const,
  code: "FOOD_REACTIONS_UNAVAILABLE" as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCalendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
    ? value
    : null;
}

function localCalendarDate(value: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year === undefined || month === undefined || day === undefined) return null;
    return parseCalendarDate(`${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  } catch {
    return null;
  }
}

function normalizeCutoff(value: FoodReactionCutoff): Readonly<{ date: Date; iso: string }> | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const date = new Date(value.getTime());
    return Object.freeze({ date, iso: date.toISOString() });
  }
  const date = parseInstant(value);
  return date === null ? null : Object.freeze({ date, iso: date.toISOString() });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function validScopeAt(scope: AuthorizedChildScope, now: Date): boolean {
  try {
    return isRecord(scope)
      && Object.isFrozen(scope)
      && Object.isFrozen(scope.permissions)
      && scope.issuedAt instanceof Date
      && scope.expiresAt instanceof Date
      && Object.isFrozen(scope.issuedAt)
      && Object.isFrozen(scope.expiresAt)
      && Number.isFinite(scope.issuedAt.getTime())
      && Number.isFinite(scope.expiresAt.getTime())
      && isUuid(scope.actorUserId)
      && isUuid(scope.careSpaceId)
      && isUuid(scope.childId)
      && Array.isArray(scope.permissions)
      && scope.permissions.length > 0
      && scope.permissions.every((permission) => isOneOf(permission, CHILD_PERMISSIONS))
      && new Set(scope.permissions).size === scope.permissions.length
      && isOneOf(scope.countryOfCare, ["CO", "US"] as const)
      && typeof scope.timezone === "string"
      && isAuthorizedChildScopeActive(scope, now)
      && hasPermission(scope, "read", now);
  } catch {
    return false;
  }
}

function normalizeRow(
  row: FoodReactionRow,
  scope: AuthorizedChildScope,
  cutoff: Date,
  cutoffLocalDate: string,
): Readonly<{ evidence: FoodReactionEvidence; disposition: "include" | "omit" }> | null {
  if (!isRecord(row)
    || !isUuid(row.id)
    || !isUuid(row.careSpaceId)
    || !isUuid(row.childId)
    || row.careSpaceId !== scope.careSpaceId
    || row.childId !== scope.childId
    || typeof row.substanceName !== "string"
    || row.substanceName.trim().length === 0
    || row.substanceName.length > 500
    || (row.normalizedCode !== null && (typeof row.normalizedCode !== "string" || !CODE_PATTERN.test(row.normalizedCode)))
    || !isOneOf(row.reactionType, REACTION_TYPES)
    || (row.severity !== null && !isOneOf(row.severity, SEVERITIES))
    || !isOneOf(row.status, STATUSES)
    || !isOneOf(row.provenanceType, PROVENANCE_TYPES)) return null;

  const createdAt = parseInstant(row.createdAt);
  const updatedAt = parseInstant(row.updatedAt);
  const observedOn = row.observedOn === null ? null : parseCalendarDate(row.observedOn);
  if (createdAt === null || updatedAt === null || (row.observedOn !== null && observedOn === null) || createdAt > updatedAt) return null;

  const createdAfterCutoff = createdAt > cutoff;
  if ((!createdAfterCutoff && updatedAt > cutoff)
    || (!createdAfterCutoff && observedOn !== null && observedOn > cutoffLocalDate)) return null;

  const normalizedLabel = row.substanceName.trim();
  const normalizedCreatedAt = createdAt.toISOString();
  const normalizedUpdatedAt = updatedAt.toISOString();
  const status = row.status;
  const lifecycle: FoodReactionLifecycle = status === "resolved"
    ? "resolved"
    : status === "entered_in_error" ? "entered_in_error" : "active";
  const evidence: FoodReactionEvidence = {
    identity: {
      id: row.id,
      foodLabel: normalizedLabel,
      foodCode: row.normalizedCode,
      mapping: row.normalizedCode === null ? "unmapped" : "normalized",
    },
    declaration: {
      reactionType: row.reactionType,
      severity: row.severity,
      status,
      lifecycle,
    },
    confirmation: {
      status: status === "confirmed" ? "confirmed" : status === "declared" ? "declared" : "unknown",
    },
    supersession: "unknown",
    uncertainty: [
      "supersession_unavailable",
      ...(status === "resolved" || status === "entered_in_error" ? ["confirmation_uncertain" as const] : []),
      ...(row.normalizedCode === null ? ["unmapped_food" as const] : []),
    ],
    provenance: {
      provenanceType: row.provenanceType,
      observedOn,
      createdAt: normalizedCreatedAt,
      updatedAt: normalizedUpdatedAt,
    },
  };
  return Object.freeze({ evidence: Object.freeze(evidence), disposition: createdAfterCutoff ? "omit" : "include" });
}

function identityKey(evidence: FoodReactionEvidence): string {
  return evidence.identity.foodCode === null
    ? `label:${evidence.identity.foodLabel.toLocaleLowerCase("en-US")}`
    : `code:${evidence.identity.foodCode}`;
}

function evidenceSignature(evidence: FoodReactionEvidence): string {
  return [
    evidence.identity.id,
    evidence.identity.foodLabel,
    evidence.identity.foodCode ?? "",
    evidence.declaration.reactionType,
    evidence.declaration.severity ?? "",
    evidence.declaration.status,
    evidence.provenance.provenanceType,
    evidence.provenance.observedOn ?? "",
    evidence.provenance.createdAt,
    evidence.provenance.updatedAt,
  ].join("\u0000");
}

function compareEvidence(left: FoodReactionEvidence, right: FoodReactionEvidence): number {
  const leftKey = [
    left.identity.id,
    left.identity.foodCode ?? "",
    left.identity.foodLabel,
    left.declaration.reactionType,
    left.declaration.status,
    left.declaration.severity ?? "",
    left.provenance.provenanceType,
    left.provenance.observedOn ?? "",
    left.provenance.createdAt,
    left.provenance.updatedAt,
  ].join("\u0000");
  const rightKey = [
    right.identity.id,
    right.identity.foodCode ?? "",
    right.identity.foodLabel,
    right.declaration.reactionType,
    right.declaration.status,
    right.declaration.severity ?? "",
    right.provenance.provenanceType,
    right.provenance.observedOn ?? "",
    right.provenance.createdAt,
    right.provenance.updatedAt,
  ].join("\u0000");
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function markUncertainty(
  evidence: FoodReactionEvidence,
  additions: readonly FoodReactionUncertainty[],
): FoodReactionEvidence {
  return Object.freeze({
    ...evidence,
    uncertainty: Object.freeze([...new Set([...evidence.uncertainty, ...additions])].sort()),
  });
}

function annotateAmbiguity(evidence: readonly FoodReactionEvidence[]): readonly FoodReactionEvidence[] {
  const byId = new Map<string, FoodReactionEvidence[]>();
  const byFood = new Map<string, FoodReactionEvidence[]>();
  for (const item of evidence) {
    const idItems = byId.get(item.identity.id) ?? [];
    idItems.push(item);
    byId.set(item.identity.id, idItems);
    const foodItems = byFood.get(identityKey(item)) ?? [];
    foodItems.push(item);
    byFood.set(identityKey(item), foodItems);
  }

  return evidence.map((item) => {
    const duplicate = (byId.get(item.identity.id)?.length ?? 0) > 1;
    const foodItems = byFood.get(identityKey(item)) ?? [];
    const signatures = new Set(foodItems.map(evidenceSignature));
    const conflict = signatures.size > 1;
    return markUncertainty(item, [
      ...(duplicate ? ["duplicate_identity" as const] : []),
      ...(conflict ? ["conflicting_evidence" as const] : []),
    ]);
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_CANONICAL_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const members = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(",")}}`;
  }
  throw new Error("NON_CANONICAL_VALUE");
}

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex") as Sha256Hex;
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createFoodReactionQuery(
  dependencies: FoodReactionQueryDependencies,
  options: FoodReactionQueryOptions = {},
): FoodReactionQuery {
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    async execute(scope: AuthorizedChildScope, cutoff: FoodReactionCutoff): Promise<FoodReactionQueryResult> {
      const normalizedCutoff = normalizeCutoff(cutoff);
      let requestNow: Date;
      try {
        requestNow = now();
      } catch {
        return FAILURE;
      }
      const normalizedRequestNow = normalizeCutoff(requestNow);
      if (normalizedCutoff === null
        || normalizedRequestNow === null
        || !validScopeAt(scope, normalizedRequestNow.date)) return FAILURE;

      let freshScope: AuthorizedChildScope | null;
      try {
        freshScope = await dependencies.accessRevalidator.validate(scope, normalizedRequestNow.iso);
      } catch {
        return FAILURE;
      }
      try {
        if (freshScope === null
          || freshScope === undefined
          || !sameAuthorizedChildScope(scope, freshScope)
          || freshScope.countryOfCare !== scope.countryOfCare
          || freshScope.timezone !== scope.timezone
          || freshScope.permissions.some((permission) => !scope.permissions.includes(permission))
          || !validScopeAt(freshScope, normalizedRequestNow.date)) return FAILURE;
      } catch {
        return FAILURE;
      }

      const cutoffLocalDate = localCalendarDate(normalizedCutoff.date, freshScope.timezone);
      if (cutoffLocalDate === null) return FAILURE;

      let rows: readonly FoodReactionRow[] | null;
      try {
        rows = await dependencies.repository.getReactions(freshScope, normalizedCutoff.iso);
      } catch {
        return FAILURE;
      }
      if (rows === null || rows === undefined || !Array.isArray(rows)) return FAILURE;

      const normalized: FoodReactionEvidence[] = [];
      for (const row of rows) {
        const item = normalizeRow(row, freshScope, normalizedCutoff.date, cutoffLocalDate);
        if (item === null) return FAILURE;
        if (item.disposition === "include") normalized.push(item.evidence);
      }

      const reactions = [...annotateAmbiguity(normalized)].sort(compareEvidence);
      const material = {
        algorithmVersion: "food-reaction-query.v1",
        cutoff: normalizedCutoff.iso,
        reactions,
      };
      const result: FoodReactionQuerySuccess = {
        ok: true,
        status: "available",
        reactions,
        digest: digest(material),
      };
      return deepFreeze(result);
    },
  });
}
