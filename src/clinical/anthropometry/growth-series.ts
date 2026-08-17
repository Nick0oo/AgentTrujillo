import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { GrowthIndicator, MeasurementMethod, MeasurementType } from "./types.ts";

export const GROWTH_SERIES_CURSOR_VERSION = "growth-series.v1";
export const GROWTH_SERIES_MAX_PAGE_SIZE = 200;

export type GrowthSeriesQuery = Readonly<{
  scope: AuthorizedChildScope;
  indicator?: GrowthIndicator;
  measurementType?: MeasurementType;
  from?: string;
  to?: string;
  pageSize?: number;
  cursor?: string;
}>;

export type RawGrowthSeriesRow = Readonly<{
  measurementId: string;
  assessmentId: string;
  occurredAt: string;
  assessedAt: string;
  measurementType: MeasurementType;
  measurementMethod: MeasurementMethod;
  validationStatus: string;
  supersededByMeasurementId: string | null;
  indicator: GrowthIndicator;
  standardKey: string;
  standardVersion: string | null;
  datasetDigest: string | null;
  ageBasis: "chronological" | "corrected" | null;
  chronologicalAgeDays: number;
  correctedAgeDays: number | null;
  resultStatus: "calculated" | "rule_unavailable" | "insufficient_data" | "excluded";
  interpretation: "within_expected" | "review_required" | "urgent_review" | "unavailable" | null;
  zScore: string | null;
  percentile: string | null;
  warnings: readonly string[];
  transitionReason: string | null;
}>;

export type GrowthSeriesSegment = Readonly<{
  key: string;
  standardKey: string;
  standardVersion: string | null;
  indicator: GrowthIndicator;
  ageBasis: "chronological" | "corrected" | null;
  measurementMethod: MeasurementMethod;
  transitionReason: string | null;
  pointIndexes: readonly number[];
}>;

export type GrowthSeriesPoint = Readonly<RawGrowthSeriesRow & {
  segmentKey: string;
  transition: boolean;
}>;

export type GrowthSeriesCursor = string;

export type GrowthSeries = Readonly<{
  points: readonly GrowthSeriesPoint[];
  segments: readonly GrowthSeriesSegment[];
  nextCursor: GrowthSeriesCursor | null;
  hasMore: boolean;
}>;

type CursorPayload = Readonly<{
  version: typeof GROWTH_SERIES_CURSOR_VERSION;
  childId: string;
  filterDigest: string;
  last: Readonly<{ occurredAt: string; measurementId: string; assessedAt: string; assessmentId: string }>;
}>;

export class GrowthSeriesError extends Error {
  readonly code: "SERIES_QUERY_INVALID" | "SERIES_CURSOR_INVALID";

  constructor(code: GrowthSeriesError["code"]) {
    super(code);
    this.name = "GrowthSeriesError";
    this.code = code;
  }
}

function pageSize(query: GrowthSeriesQuery): number {
  const size = query.pageSize ?? 50;
  if (!Number.isInteger(size) || size < 1 || size > GROWTH_SERIES_MAX_PAGE_SIZE) throw new GrowthSeriesError("SERIES_QUERY_INVALID");
  return size;
}

function filterDigest(query: GrowthSeriesQuery): string {
  return createHash("sha256").update(canonicalize({
    version: GROWTH_SERIES_CURSOR_VERSION,
    childId: query.scope.childId,
    indicator: query.indicator ?? null,
    measurementType: query.measurementType ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
  })).digest("hex");
}

function base64(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function unbase64(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function encodeGrowthSeriesCursor(query: GrowthSeriesQuery, last: CursorPayload["last"], secret: string): GrowthSeriesCursor {
  const payload: CursorPayload = { version: GROWTH_SERIES_CURSOR_VERSION, childId: query.scope.childId, filterDigest: filterDigest(query), last };
  const encoded = base64(canonicalize(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function decodeGrowthSeriesCursor(query: GrowthSeriesQuery, cursor: string, secret: string): CursorPayload {
  try {
    const [encoded, signature] = cursor.split(".");
    if (!encoded || !signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(encoded, secret)))) throw new Error();
    const payload = JSON.parse(unbase64(encoded)) as CursorPayload;
    if (payload.version !== GROWTH_SERIES_CURSOR_VERSION || payload.childId !== query.scope.childId || payload.filterDigest !== filterDigest(query)) throw new Error();
    if (!payload.last?.occurredAt || !payload.last.measurementId || !payload.last.assessedAt || !payload.last.assessmentId) throw new Error();
    if (!Number.isFinite(new Date(payload.last.occurredAt).getTime()) || !Number.isFinite(new Date(payload.last.assessedAt).getTime())) throw new Error();
    return payload;
  } catch {
    throw new GrowthSeriesError("SERIES_CURSOR_INVALID");
  }
}

function compare(left: RawGrowthSeriesRow, right: RawGrowthSeriesRow): number {
  return left.occurredAt.localeCompare(right.occurredAt)
    || left.measurementId.localeCompare(right.measurementId)
    || left.assessedAt.localeCompare(right.assessedAt)
    || left.assessmentId.localeCompare(right.assessmentId);
}

function after(row: RawGrowthSeriesRow, last: CursorPayload["last"]): boolean {
  return row.occurredAt > last.occurredAt
    || (row.occurredAt === last.occurredAt && row.measurementId > last.measurementId)
    || (row.occurredAt === last.occurredAt && row.measurementId === last.measurementId && row.assessedAt > last.assessedAt)
    || (row.occurredAt === last.occurredAt && row.measurementId === last.measurementId && row.assessedAt === last.assessedAt && row.assessmentId > last.assessmentId);
}

function segmentKey(row: RawGrowthSeriesRow): string {
  return [row.standardKey, row.standardVersion ?? "", row.indicator, row.ageBasis ?? "", row.measurementMethod].join("|");
}

export function buildGrowthSeries(rows: readonly RawGrowthSeriesRow[], query: GrowthSeriesQuery, secret: string): GrowthSeries {
  const size = pageSize(query);
  const start = query.from ? new Date(query.from).getTime() : -Infinity;
  const end = query.to ? new Date(query.to).getTime() : Infinity;
  if (!Number.isFinite(start) && query.from || !Number.isFinite(end) && query.to || start > end) throw new GrowthSeriesError("SERIES_QUERY_INVALID");
  const cursor = query.cursor ? decodeGrowthSeriesCursor(query, query.cursor, secret) : null;
  const eligible = rows.filter((row) => row.validationStatus === "confirmed" && row.resultStatus !== "excluded" && !row.supersededByMeasurementId
    && (!query.indicator || row.indicator === query.indicator)
    && (!query.measurementType || row.measurementType === query.measurementType)
    && new Date(row.occurredAt).getTime() >= start
    && new Date(row.occurredAt).getTime() <= end
    && (!cursor || after(row, cursor.last))).sort(compare);
  const page = eligible.slice(0, size);
  const hasMore = eligible.length > size;
  const points: GrowthSeriesPoint[] = page.map((row, index) => {
    const previous = page[index - 1];
    const key = segmentKey(row);
    const transition = Boolean(previous && segmentKey(previous) !== key);
    return Object.freeze({ ...row, segmentKey: key, transition });
  });
  const segments: GrowthSeriesSegment[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const existing = segments[segments.length - 1];
    if (!existing || existing.key !== point.segmentKey) segments.push(Object.freeze({
      key: point.segmentKey,
      standardKey: point.standardKey,
      standardVersion: point.standardVersion,
      indicator: point.indicator,
      ageBasis: point.ageBasis,
      measurementMethod: point.measurementMethod,
      transitionReason: point.transition ? point.transitionReason ?? "segment_boundary" : null,
      pointIndexes: [index],
    }));
    else ((segments[segments.length - 1] as unknown) as { pointIndexes: number[] }).pointIndexes.push(index);
  }
  const last = points[points.length - 1];
  return Object.freeze({ points, segments, hasMore, nextCursor: hasMore && last ? encodeGrowthSeriesCursor(query, { occurredAt: last.occurredAt, measurementId: last.measurementId, assessedAt: last.assessedAt, assessmentId: last.assessmentId }, secret) : null });
}
