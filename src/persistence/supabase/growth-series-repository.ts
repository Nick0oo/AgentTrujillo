import type { SupabaseClient } from "@supabase/supabase-js";

import { hasPermission } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Database } from "./database.types.ts";
import { buildGrowthSeries, decodeGrowthSeriesCursor } from "../../clinical/anthropometry/growth-series.ts";
import type { GrowthSeriesRepository } from "../../clinical/anthropometry/growth-series-repository.ts";
import type { RawGrowthSeriesRow } from "../../clinical/anthropometry/growth-series.ts";

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

function asRow(row: Row): RawGrowthSeriesRow | null {
  if (typeof row.measurement_id !== "string" || typeof row.assessment_id !== "string" || typeof row.occurred_at !== "string" || typeof row.assessed_at !== "string") return null;
  if (typeof row.indicator !== "string" || typeof row.standard_key !== "string" || typeof row.measurement_type !== "string" || typeof row.measurement_method !== "string") return null;
  return Object.freeze({
    measurementId: row.measurement_id,
    assessmentId: row.assessment_id,
    occurredAt: row.occurred_at,
    assessedAt: row.assessed_at,
    measurementType: row.measurement_type as RawGrowthSeriesRow["measurementType"],
    measurementMethod: row.measurement_method as RawGrowthSeriesRow["measurementMethod"],
    validationStatus: String(row.validation_status ?? ""),
    supersededByMeasurementId: typeof row.superseded_by_measurement_id === "string" ? row.superseded_by_measurement_id : null,
    indicator: row.indicator as RawGrowthSeriesRow["indicator"],
    standardKey: row.standard_key,
    standardVersion: typeof row.standard_version === "string" ? row.standard_version : null,
    datasetDigest: typeof row.dataset_digest === "string" ? row.dataset_digest : null,
    ageBasis: row.age_basis === "corrected" || row.age_basis === "chronological" ? row.age_basis : null,
    chronologicalAgeDays: Number(row.chronological_age_days),
    correctedAgeDays: row.corrected_age_days === null ? null : Number(row.corrected_age_days),
    resultStatus: row.result_status as RawGrowthSeriesRow["resultStatus"],
    interpretation: row.interpretation as RawGrowthSeriesRow["interpretation"],
    zScore: typeof row.z_score_lexeme === "string" ? row.z_score_lexeme : row.z_score === null ? null : String(row.z_score),
    percentile: typeof row.percentile_lexeme === "string" ? row.percentile_lexeme : row.percentile === null ? null : String(row.percentile),
    warnings: Array.isArray(row.warnings) ? row.warnings.filter((warning): warning is string => typeof warning === "string") : [],
    transitionReason: typeof row.transition_reason === "string" ? row.transition_reason : null,
  });
}

export function createGrowthSeriesRepository(client: Client, options: Readonly<{ cursorSecret: string }>): GrowthSeriesRepository {
  if (!options.cursorSecret || options.cursorSecret.length < 32) throw new Error("GROWTH_SERIES_CURSOR_SECRET_REQUIRED");
  return Object.freeze({
    async list(query, signal) {
      if (!hasPermission(query.scope, "read")) throw new Error("ACCESS_DENIED");
      if (signal?.aborted) throw new Error("SERIES_QUERY_CANCELLED");
      const size = query.pageSize ?? 50;
      const view = (client.from as unknown as (table: string) => any)("growth_series_points");
      let builder = view.select("*")
        .eq("care_space_id", query.scope.careSpaceId)
        .eq("child_id", query.scope.childId)
        .eq("validation_status", "confirmed")
        .is("superseded_by_measurement_id", null)
        .order("occurred_at", { ascending: true })
        .order("measurement_id", { ascending: true })
        .order("assessed_at", { ascending: true })
        .order("assessment_id", { ascending: true })
        .limit(size + 1);
      if (query.indicator) builder = builder.eq("indicator", query.indicator);
      if (query.measurementType) builder = builder.eq("measurement_type", query.measurementType);
      if (query.from) builder = builder.gte("occurred_at", query.from);
      if (query.to) builder = builder.lte("occurred_at", query.to);
      if (query.cursor) {
        const cursor = decodeGrowthSeriesCursor(query, query.cursor, options.cursorSecret);
        const last = cursor.last;
        builder = builder.or([
          `occurred_at.gt.${last.occurredAt}`,
          `and(occurred_at.eq.${last.occurredAt},measurement_id.gt.${last.measurementId})`,
          `and(occurred_at.eq.${last.occurredAt},measurement_id.eq.${last.measurementId},assessed_at.gt.${last.assessedAt})`,
          `and(occurred_at.eq.${last.occurredAt},measurement_id.eq.${last.measurementId},assessed_at.eq.${last.assessedAt},assessment_id.gt.${last.assessmentId})`,
        ].join(","));
      }
      const result = await builder;
      if (signal?.aborted) throw new Error("SERIES_QUERY_CANCELLED");
      if (result.error || !Array.isArray(result.data)) throw new Error("SERIES_QUERY_UNAVAILABLE");
      const rows = (result.data as Row[]).map(asRow).filter((row): row is RawGrowthSeriesRow => row !== null);
      return buildGrowthSeries(rows, query, options.cursorSecret);
    },
  });
}
