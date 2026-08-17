import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { GrowthSeries, GrowthSeriesQuery } from "./growth-series.ts";

export type GrowthSeriesRepository = Readonly<{
  list: (query: GrowthSeriesQuery, signal?: AbortSignal) => Promise<GrowthSeries>;
}>;

export type GrowthSeriesScope = AuthorizedChildScope;
