import { describe, expect, it } from "vitest";

import {
  EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA,
  type EvaluateVaccinationScheduleTrustedResult,
} from "../../agent/tools/evaluate_vaccination_schedule";
import {
  VACCINATION_STATUS_WIDGET_SCHEMA,
  VaccinationStatusPresentationError,
  presentVaccinationStatus,
} from "../../src/presentation/vaccination-status";

const CITATION = `citation:v1:${"a".repeat(64)}`;
const FACT = `fact:v1:${"b".repeat(64)}`;
const STATUSES = [
  "applied",
  "upcoming",
  "due",
  "overdue",
  "not_applicable",
  "review_required",
] as const;

function assessment(status: typeof STATUSES[number], index: number, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ruleCode: `CO-PAI-RULE-${index + 1}`,
    seriesCode: `SERIES_${index + 1}`,
    doseCode: `D${index + 1}`,
    doseNumber: index + 1,
    status,
    reasonCode: `REASON_${index + 1}`,
    dueFrom: index === 0 ? null : `2026-0${Math.min(index + 1, 9)}-01`,
    dueUntil: index === 0 || index === 1 ? null : `2026-0${Math.min(index + 1, 9)}-28`,
    evidence: {
      matchedFactCount: index === 0 ? 1 : 0,
      matchedFactHandles: index === 0 ? [FACT] : [],
    },
    provenance: {
      sources: [{
        label: "Esquema PAI Colombia",
        referenceCode: "co-pai-schedule-current-2026-08-21",
        citationHandle: CITATION,
      }],
    },
    ...overrides,
  };
}

function result(
  assessments: readonly unknown[] = STATUSES.map((status, index) => assessment(status, index)),
): EvaluateVaccinationScheduleTrustedResult {
  return EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA.parse({
    kind: "trusted_tool_result",
    toolId: "evaluate_vaccination_schedule",
    schemaVersion: "evaluate_vaccination_schedule.trusted.v1",
    data: {
      asOfDate: "2026-08-23",
      country: "CO",
      package: {
        id: "co-pai-basic-2026-v1",
        version: "2026.basic.1",
        algorithmId: "immunization-status-v1",
      },
      assessments,
    },
  });
}

describe("vaccination status presenter", () => {
  it("preserves all six deterministic statuses, exact windows, facts and provenance", () => {
    const widget = presentVaccinationStatus(result(), "es-CO");

    expect(VACCINATION_STATUS_WIDGET_SCHEMA.safeParse(widget).success).toBe(true);
    expect(widget).toMatchObject({
      kind: "vaccination_status",
      version: "vaccination.status.v1",
      data: {
        locale: "es-CO",
        asOfDate: "2026-08-23",
        country: "CO",
        package: {
          id: "co-pai-basic-2026-v1",
          version: "2026.basic.1",
          algorithmId: "immunization-status-v1",
        },
      },
    });
    expect(widget.data.timeline.rows.map((row) => row.status)).toEqual(STATUSES);
    expect(widget.data.timeline.rows.map(({ status, statusIcon }) => [status, statusIcon])).toEqual([
      ["applied", "status_applied"],
      ["upcoming", "status_upcoming"],
      ["due", "status_due"],
      ["overdue", "status_overdue"],
      ["not_applicable", "status_not_applicable"],
      ["review_required", "status_review_required"],
    ]);
    expect(widget.data.timeline.rows[0]).toMatchObject({
      id: "vaccination-status-001",
      status: "applied",
      dueWindow: { state: "not_provided", from: null, to: null, inclusive: true },
      evidence: { matchedFactCount: 1, matchedFactHandles: [FACT] },
    });
    expect(widget.data.timeline.rows[1]?.dueWindow).toMatchObject({
      state: "from_only",
      from: "2026-02-01",
      to: null,
    });
    expect(widget.data.timeline.rows[2]?.dueWindow).toMatchObject({
      state: "closed",
      from: "2026-03-01",
      to: "2026-03-28",
    });
    expect(widget.data.table.rows).toEqual(widget.data.timeline.rows);
    expect(widget.data.citations).toEqual([{
      label: "Esquema PAI Colombia",
      referenceCode: "co-pai-schedule-current-2026-08-21",
      citationHandle: CITATION,
    }]);
  });

  it("preserves an until-only inclusive window without calculating another date", () => {
    const widget = presentVaccinationStatus(result([
      assessment("due", 0, { dueFrom: null, dueUntil: "2026-08-31" }),
    ]), "en-US");

    expect(widget.data.timeline.rows[0]?.dueWindow).toMatchObject({
      state: "until_only",
      from: null,
      to: "2026-08-31",
      inclusive: true,
    });
    expect(widget.data.fallbackText).toContain("2026-08-31");
  });

  it("uses only the existing generic professional recommendation and exposes no operation", () => {
    const es = presentVaccinationStatus(result([assessment("review_required", 0)]), "es-CO");
    const en = presentVaccinationStatus(result([assessment("review_required", 0)]), "en-US");

    expect(es.data.professionalReview).toEqual({
      state: "present",
      messageId: "pediatrician-review-es-co",
      text: "Consulte con un pediatra para revisar esta situación.",
    });
    expect(en.data.professionalReview).toEqual({
      state: "present",
      messageId: "pediatrician-review-en-us",
      text: "Consult a pediatrician to review this situation.",
    });
    const serialized = JSON.stringify(es).toLowerCase();
    for (const forbidden of [
      '"actions"', '"url"', '"phone"', '"location"', '"notification"', '"button"',
      "appointment", "contacted", "doctor reviewed", "diagnosis", "treatment", "prescription",
      "<script", "javascript:",
    ]) expect(serialized).not.toContain(forbidden);
  });

  it("renders a deterministic accessible empty state in both locales", () => {
    const es = presentVaccinationStatus(result([]), "es-CO");
    const en = presentVaccinationStatus(result([]), "en-US");

    expect(es.data.timeline.rows).toEqual([]);
    expect(es.data.table.rows).toEqual([]);
    expect(es.data.fallbackText).toBe("No hay estados de vacunación disponibles en este resultado.");
    expect(en.data.fallbackText).toBe("No vaccination statuses are available in this result.");
    expect(es.data.screenReaderSummary).toContain("0");
    expect(presentVaccinationStatus(result([]), "es-CO")).toEqual(es);
  });

  it("deduplicates citations without changing row order or exact status data", () => {
    const input = result([
      assessment("overdue", 0, { reasonCode: "FIRST" }),
      assessment("applied", 1, { reasonCode: "SECOND" }),
    ]);
    const widget = presentVaccinationStatus(input, "es-CO");

    expect(widget.data.timeline.rows.map((row) => row.reasonCode)).toEqual(["FIRST", "SECOND"]);
    expect(widget.data.timeline.rows.map((row) => row.id)).toEqual([
      "vaccination-status-001",
      "vaccination-status-002",
    ]);
    expect(widget.data.citations).toHaveLength(1);
    expect(input.data.assessments[0]?.status).toBe("overdue");
  });

  it("fails closed on duplicate rule identities or conflicting citation metadata", () => {
    const duplicateIdentity = result([
      assessment("due", 0),
      assessment("applied", 1, {
        ruleCode: "CO-PAI-RULE-1",
        seriesCode: "SERIES_1",
        doseCode: "D1",
        doseNumber: 1,
      }),
    ]);
    const conflictingCitation = result([
      assessment("due", 0),
      assessment("applied", 1, {
        provenance: {
          sources: [{
            label: "Otra fuente aprobada",
            referenceCode: "co-pai-schedule-current-2026-08-21",
            citationHandle: CITATION,
          }],
        },
      }),
    ]);

    expect(() => presentVaccinationStatus(duplicateIdentity, "es-CO"))
      .toThrowError(VaccinationStatusPresentationError);
    expect(() => presentVaccinationStatus(conflictingCitation, "es-CO"))
      .toThrowError(VaccinationStatusPresentationError);
  });

  it("rejects model output, schema drift, authority, markup, count mismatch and unsupported locale", () => {
    const attacks: unknown[] = [
      {
        kind: "tool_result",
        toolId: "evaluate_vaccination_schedule",
        schemaVersion: "evaluate_vaccination_schedule.model.v1",
        data: { asOfDate: "2026-08-23", assessments: [] },
      },
      { ...result(), childId: "00000000-0000-4000-8000-000000000001" },
      { ...result(), version: "vaccination.status.v2" },
      {
        ...result(),
        data: {
          ...result().data,
          assessments: [assessment("due", 0, {
            provenance: {
              sources: [{
                label: "<div>unsafe</div>",
                referenceCode: "co-pai-schedule-current-2026-08-21",
                citationHandle: CITATION,
              }],
            },
          })],
        },
      },
      {
        ...result(),
        data: {
          ...result().data,
          assessments: [assessment("applied", 0, {
            evidence: { matchedFactCount: 2, matchedFactHandles: [FACT] },
          })],
        },
      },
    ];

    for (const attack of attacks) {
      expect(() => presentVaccinationStatus(attack, "es-CO")).toThrowError(VaccinationStatusPresentationError);
    }
    expect(() => presentVaccinationStatus(result(), "es-MX")).toThrowError(VaccinationStatusPresentationError);
    expect(VACCINATION_STATUS_WIDGET_SCHEMA.safeParse({
      ...presentVaccinationStatus(result(), "es-CO"),
      actions: [],
    }).success).toBe(false);
  });

  it("deep-freezes the complete mobile widget", () => {
    const widget = presentVaccinationStatus(result(), "es-CO");
    expect(Object.isFrozen(widget)).toBe(true);
    expect(Object.isFrozen(widget.data)).toBe(true);
    expect(Object.isFrozen(widget.data.timeline.rows)).toBe(true);
    expect(Object.isFrozen(widget.data.timeline.rows[0])).toBe(true);
    expect(Object.isFrozen(widget.data.timeline.rows[0]?.evidence.matchedFactHandles)).toBe(true);
  });
});
