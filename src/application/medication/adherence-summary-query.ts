import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { AdherenceSummary } from "../../clinical/medication/types.ts";
import type { MedicationStore } from "./ports.ts";
import { requireMedicationScope } from "./scope.ts";

export function createAdherenceSummaryQuery(store: MedicationStore, options: Readonly<{ now?: () => Date }> = {}) {
  const now = options.now ?? (() => new Date());
  const service = {
    async summarize(scope: AuthorizedChildScope, planId: string, window: Readonly<{ from: string; to: string }>): Promise<AdherenceSummary> {
      requireMedicationScope(scope, "read", now());
      const occurrences = await store.listOccurrences(scope, planId, window.from, window.to);
      const intakes = await store.listIntakes(scope, planId, window.from, window.to);
      const superseded = new Set(intakes.flatMap((intake) => intake.supersedesId ? [intake.supersedesId] : []));
      const activeIntakes = intakes.filter((intake) => !superseded.has(intake.id));
      const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.occurrenceId));
      const grouped = new Map<string, typeof activeIntakes>();
      for (const intake of activeIntakes) {
        if (!intake.occurrenceId) continue;
        grouped.set(intake.occurrenceId, [...(grouped.get(intake.occurrenceId) ?? []), intake]);
      }
      const sourceComplete = [...grouped].every(([id, values]) => occurrenceIds.has(id) && values.length === 1);
      const byOccurrence = new Map([...grouped].flatMap(([id, values]) => values.length === 1 && occurrenceIds.has(id) ? [[id, values[0]!] as const] : []));
      let taken = 0; let skipped = 0; let unknown = 0;
      for (const occurrence of occurrences) {
        const intake = byOccurrence.get(occurrence.occurrenceId);
        if (!intake) continue;
        if (intake.state === "taken") taken += 1;
        else if (intake.state === "skipped") skipped += 1;
        else unknown += 1;
      }
      return { windowStart: window.from, windowEnd: window.to, timeZone: scope.timezone, counts: { scheduled: occurrences.length, taken, skipped, unknown, noReport: Math.max(0, occurrences.length - taken - skipped - unknown) }, sourceComplete };
    },
    async execute(scope: AuthorizedChildScope, input: Readonly<{ planId: string; from: string; to: string; timeZone?: string }>): Promise<AdherenceSummary> {
      return this.summarize(scope, input.planId, { from: input.from, to: input.to });
    },
  };
  return service;
}

export type AdherenceSummaryQuery = ReturnType<typeof createAdherenceSummaryQuery>;
