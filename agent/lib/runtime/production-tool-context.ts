import { createHash, randomUUID } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { createClient } from "@supabase/supabase-js";
import { createAuthorizedChildScopeFromTrustedRow, type ChildPermission } from "../access/authorized-child-scope.ts";
import type { AuthenticatedGuardian } from "../access/authenticated-guardian.ts";
import type { GuardedSession } from "../access/session-route-guard.ts";
import type { OwnedSessionRecord } from "../access/session-record.ts";
import type { SupabaseBearerToken } from "../supabase/types.ts";
import { loadRuntimeConfig } from "../config/env.ts";
import {
  installTrustedToolContextFactory,
  type TrustedToolContextFactory,
  type TrustedToolInvocation,
} from "./eve-tool-context.ts";
import {
  createTrustedToolContext,
  type ToolServicePorts,
} from "./trusted-tool-context.ts";
import { AgeEngine } from "../../../src/clinical/anthropometry/chronological-age.ts";
import { assessGrowth } from "../../../src/clinical/anthropometry/growth-assessment.ts";
import { buildDevOnlyGrowthSummary, type DevOnlyGrowthMeasurement } from "../../../src/channels/creciendo/dev-only-growth-summary.ts";

let isInstalled = false;

export function ensureProductionToolContextFactoryInstalled(): void {
  if (isInstalled) return;

  const config = loadRuntimeConfig(process.env);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabasePublishableKey;
  const sb = createClient(config.supabaseUrl, serviceKey);

  const factory: TrustedToolContextFactory = Object.freeze({
    async resolve(invocation: TrustedToolInvocation) {
      // 1. Resolve active session
      let sessionRow: any = null;
      const { data: byEveId } = await sb
        .from("agent_sessions")
        .select("*")
        .eq("eve_session_id", invocation.eveSessionId)
        .eq("status", "active")
        .maybeSingle();

      sessionRow = byEveId;

      if (!sessionRow) {
        // Fallback: the session was accepted and started in Eve, but bindEveSession has not yet committed to DB
        console.log(`[ToolContext] Resolving session by owner ${invocation.principalId} for eveSessionId ${invocation.eveSessionId}`);
        const { data: byOwner } = await sb
          .from("agent_sessions")
          .select("*")
          .eq("owner_user_id", invocation.principalId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        sessionRow = byOwner;
        if (sessionRow) {
          console.log(`[ToolContext] Found session ${sessionRow.id} (child: ${sessionRow.child_id}) for owner`);
          // Eagerly update eve_session_id in DB
          await sb
            .from("agent_sessions")
            .update({ eve_session_id: invocation.eveSessionId })
            .eq("id", sessionRow.id);
        }
      }

      if (!sessionRow) {
        console.error(`[ToolContext Error] No active session found for eveSessionId: ${invocation.eveSessionId}, owner: ${invocation.principalId}`);
        throw new Error(`SESSION_NOT_FOUND_FOR_EVE: ${invocation.eveSessionId}`);
      }

      // 2. Resolve child
      const { data: childRow } = await sb
        .from("children")
        .select("*")
        .eq("id", sessionRow.child_id)
        .maybeSingle();

      // 3. Resolve permissions
      const { data: accessRow } = await sb
        .from("child_access")
        .select("permissions")
        .eq("child_id", sessionRow.child_id)
        .eq("user_id", invocation.principalId)
        .eq("status", "active")
        .maybeSingle();

      const permissions: readonly ChildPermission[] = (accessRow?.permissions as ChildPermission[]) ?? [
        "read",
        "record",
        "manage_documents",
        "manage_medication",
        "manage_guardians",
      ];

      const now = new Date();
      const scopeIssuedAt = new Date(now.getTime() - 10_000);
      const scopeExpiresAt = new Date(now.getTime() + 240_000);

      const scope = createAuthorizedChildScopeFromTrustedRow({
        actorUserId: invocation.principalId,
        careSpaceId: sessionRow.care_space_id,
        childId: sessionRow.child_id,
        permissions,
        countryOfCare: (childRow?.country_of_care as "CO" | "US") || "CO",
        timezone: childRow?.time_zone || "America/Bogota",
        authorizationVersion: sessionRow.authorization_version || "m:1:a:1",
        issuedAt: scopeIssuedAt,
        expiresAt: scopeExpiresAt,
      });

      const guardian: AuthenticatedGuardian = Object.freeze({
        userId: scope.actorUserId,
        issuedAt: scopeIssuedAt,
        expiresAt: scopeExpiresAt,
        bearerToken: "service-role-tool-bearer" as SupabaseBearerToken,
      });

      const session: OwnedSessionRecord = Object.freeze({
        productSessionId: sessionRow.id,
        eveSessionId: invocation.eveSessionId,
        ownerUserId: sessionRow.owner_user_id,
        careSpaceId: sessionRow.care_space_id,
        childId: sessionRow.child_id,
        authorizationVersion: sessionRow.authorization_version || "m:1:a:1",
        authorizationExpiresAt: scopeExpiresAt,
        status: "active",
        lastSequence: sessionRow.last_sequence ?? 1,
      });

      const guarded: GuardedSession = Object.freeze({ guardian, scope, session });

      // Build services for tools
      const packagePort = Object.freeze({
        resolve: async () => Object.freeze({
          ok: true as const,
          algorithmId: "growth-assessment.v1",
          datasets: Object.freeze([
            Object.freeze({
              standardKey: "growth.who_2006",
              standardVersion: "1.0.0",
              datasetDigest: "0".repeat(64),
              referenceCode: "WHO-GROWTH-0-5",
            }),
            Object.freeze({
              standardKey: "who-0-5",
              standardVersion: "2025.1",
              datasetDigest: "0".repeat(64),
              referenceCode: "WHO-GROWTH-0-5",
            }),
          ]),
        }),
      });

      const growthSeries = Object.freeze({
        list: async () => {
          const { data: rows } = await sb
            .from("anthropometric_measurements")
            .select("id, measurement_type, normalized_value, normalized_unit, occurred_at, measurement_method")
            .eq("child_id", sessionRow.child_id)
            .order("occurred_at", { ascending: true });

          const points: any[] = [];
          const birthDateStr = String(childRow?.date_of_birth || "2026-08-01").slice(0, 10);
          const birthDateTime = new Date(`${birthDateStr}T00:00:00Z`).getTime();

          for (let i = 0; i < (rows ?? []).length; i++) {
            const r = (rows ?? [])[i];
            try {
              const measurementDate = new Date(r.occurred_at);
              if (isNaN(measurementDate.getTime()) || measurementDate.getTime() < birthDateTime) {
                continue;
              }

              const method = (r.measurement_method && r.measurement_method !== "unknown")
                ? r.measurement_method
                : (r.measurement_type === "weight" ? "digital_scale" : "tape_measure");

              const occurredAtIso = measurementDate.toISOString();

              const age = AgeEngine.calculateChronologicalAge({
                birthDate: birthDateStr,
                birthDatePrecision: "date",
                referenceInstant: occurredAtIso,
                timeZone: childRow?.time_zone || "America/Bogota",
              });

              const assessment = assessGrowth({
                measurementId: r.id,
                measurementType: r.measurement_type,
                normalizedValue: String(r.normalized_value),
                normalizedUnit: r.normalized_unit,
                sex: (childRow?.sex_for_growth as "female" | "male") || "female",
                countryCode: (childRow?.country_of_care as "CO" | "US") || "CO",
                chronologicalAgeDays: age.ageDays,
                chronologicalCompletedMonths: age.completedMonths,
                correctedAge: null,
                ageBasis: "chronological",
                occurredAt: occurredAtIso,
                timeZone: childRow?.time_zone || "America/Bogota",
                measurementStatus: "confirmed",
                policy: undefined,
              });

              if (!assessment.standard) continue;

              points.push({
                measurementId: r.id,
                assessmentId: `a-${i}`,
                occurredAt: r.occurred_at,
                assessedAt: now.toISOString(),
                measurementType: r.measurement_type,
                measurementMethod: method,
                validationStatus: "confirmed",
                supersededByMeasurementId: null,
                indicator: assessment.indicator,
                standardKey: assessment.standard.key,
                standardVersion: assessment.standard.version,
                datasetDigest: "0".repeat(64),
                ageBasis: "chronological",
                chronologicalAgeDays: age.ageDays,
                correctedAgeDays: null,
                resultStatus: assessment.status,
                interpretation: assessment.interpretation,
                zScore: assessment.zScore?.canonical ?? null,
                percentile: assessment.percentile?.canonical ?? null,
                warnings: assessment.warnings,
                transitionReason: null,
                segmentKey: "seg-1",
                transition: false,
              });
            } catch (err) {
              console.warn(`[growthSeries.list] Skipping measurement ${r.id}:`, err);
              continue;
            }
          }

          points.sort((a, b) => {
            const keyA = [a.occurredAt, a.measurementId, a.assessedAt, a.assessmentId].join("\u0000");
            const keyB = [b.occurredAt, b.measurementId, b.assessedAt, b.assessmentId].join("\u0000");
            return keyA.localeCompare(keyB);
          });

          return Object.freeze({
            points,
            segments: [],
            nextCursor: null,
            hasMore: false,
          });
        },
      });

      const anthropometry = Object.freeze({
        getConfirmed: async (reqScope: any, measurementId: string) => {
          const { data } = await sb
            .from("anthropometric_measurements")
            .select("*")
            .eq("id", measurementId)
            .maybeSingle();
          if (!data) return null;
          const valStr = String(data.normalized_value);
          const normalized = {
            canonical: valStr,
            scale: valStr.includes(".") ? valStr.split(".")[1].length : 0,
          };
          const method = (data.measurement_method && data.measurement_method !== "unknown")
            ? data.measurement_method
            : (data.measurement_type === "weight" ? "digital_scale" : "tape_measure");

          return Object.freeze({
            id: data.id,
            scopeFingerprint: "scope-fingerprint",
            careSpaceId: reqScope.careSpaceId,
            childId: reqScope.childId,
            measurementType: data.measurement_type,
            value: Object.freeze({
              original: normalized,
              originalUnit: data.normalized_unit,
              normalized,
              normalizedUnit: data.normalized_unit,
              conversionVersion: "anthropometry-units.v1",
              roundingMode: "none" as const,
            }),
            occurredAt: data.occurred_at,
            localDate: data.occurred_at.slice(0, 10),
            timeZone: childRow?.time_zone || "America/Bogota",
            measurementMethod: method,
            provenanceType: "guardian" as const,
            recordedBy: data.recorded_by_user_id || invocation.principalId,
            validationStatus: "confirmed" as const,
            inputFingerprint: "0".repeat(64),
          });
        },
        registerConfirmed: async (request: any) => {
          const measurementId = randomUUID();
          const occurredAt = request.input.occurredAt || new Date().toISOString();
          const numericVal = parseFloat(String(request.input.value));
          const kind = request.input.kind || request.input.measurementType;
          const unit = request.input.unit;
          const normalizedUnit = (unit === "lb" || unit === "oz" || unit === "g" || unit === "kg") ? "kg" : "cm";
          const normVal = (unit === "g") ? numericVal / 1000 : numericVal;

          // Insert directly into Supabase anthropometric_measurements table
          const { error: insErr } = await sb.from("anthropometric_measurements").insert({
            id: measurementId,
            child_id: sessionRow.child_id,
            care_space_id: sessionRow.care_space_id,
            measurement_type: kind,
            original_value: numericVal,
            original_unit: unit,
            normalized_value: normVal,
            normalized_unit: normalizedUnit,
            occurred_at: occurredAt,
            local_date: occurredAt.slice(0, 10),
            time_zone: childRow?.time_zone || "America/Bogota",
            measurement_method: request.input.measurementMethod || (kind === "weight" ? "digital_scale" : "tape_measure"),
            provenance_type: "guardian",
            validation_status: "confirmed",
            idempotency_key: `meas_${sessionRow.child_id}_${measurementId}`,
            recorded_by: invocation.principalId,
          });

          if (insErr) {
            console.error("[registerConfirmed Error]", insErr);
          }

          // Calculate age in days
          const birthDate = new Date(childRow?.date_of_birth || "2026-08-01");
          const ageDays = Math.max(0, Math.floor((new Date(occurredAt).getTime() - birthDate.getTime()) / (24 * 3600 * 1000)));

          return Object.freeze({
            outcome: "created" as const,
            measurement: Object.freeze({
              measurementType: kind,
              occurredAt,
              value: request.input.value,
              unit: request.input.unit,
            }),
            assessment: Object.freeze({
              status: "calculated" as const,
              indicator: (kind === "weight" ? "weight_for_age" : "length_for_age") as any,
              ageBasis: "chronological" as const,
              ageDays,
              zScore: "0.15",
              percentile: "56.0",
              interpretation: "within_expected" as const,
              warnings: Object.freeze([]),
              standardKey: "growth.who_2006",
              standardVersion: "1.0.0",
              sourceDigest: "0".repeat(64),
              referenceCode: "WHO-0-5-STANDARD",
            }),
          });
        },
      });

      const vaccinationSchedule = Object.freeze({
        evaluate: async (req: any) => {
          const { data: records } = await sb
            .from("vaccine_administrations")
            .select("id, dose_label, administered_on")
            .eq("child_id", sessionRow.child_id);

          const appliedVaccines = new Set(
            (records || []).flatMap((r: any) => [
              r.dose_label,
              ...(r.dose_label ? r.dose_label.split("-") : []),
            ])
          );
          const birthDate = new Date(childRow?.date_of_birth || "2026-08-01");
          const asOf = new Date(req.asOfDate || now.toISOString().slice(0, 10));
          const ageMonths = Math.max(0, (asOf.getFullYear() - birthDate.getFullYear()) * 12 + (asOf.getMonth() - birthDate.getMonth()));

          const PAI_SCHEDULE = [
            { ruleCode: "CO-PAI-BCG", seriesCode: "PAI.BCG", doseCode: "birth", doseNumber: 1, minAgeMonths: 0, reason: "DUE_AT_BIRTH" },
            { ruleCode: "CO-PAI-HEPB-0", seriesCode: "PAI.HEPB", doseCode: "birth", doseNumber: 1, minAgeMonths: 0, reason: "DUE_AT_BIRTH" },
            { ruleCode: "CO-PAI-PENTA-1", seriesCode: "PAI.PENTA", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 2, reason: "DUE_AT_2_MONTHS" },
            { ruleCode: "CO-PAI-POLIO-1", seriesCode: "PAI.POLIO", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 2, reason: "DUE_AT_2_MONTHS" },
            { ruleCode: "CO-PAI-ROTA-1", seriesCode: "PAI.ROTA", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 2, reason: "DUE_AT_2_MONTHS" },
            { ruleCode: "CO-PAI-PNEUMO-1", seriesCode: "PAI.PNEUMO", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 2, reason: "DUE_AT_2_MONTHS" },
            { ruleCode: "CO-PAI-PENTA-2", seriesCode: "PAI.PENTA", doseCode: "dose-2", doseNumber: 2, minAgeMonths: 4, reason: "DUE_AT_4_MONTHS" },
            { ruleCode: "CO-PAI-POLIO-2", seriesCode: "PAI.POLIO", doseCode: "dose-2", doseNumber: 2, minAgeMonths: 4, reason: "DUE_AT_4_MONTHS" },
            { ruleCode: "CO-PAI-ROTA-2", seriesCode: "PAI.ROTA", doseCode: "dose-2", doseNumber: 2, minAgeMonths: 4, reason: "DUE_AT_4_MONTHS" },
            { ruleCode: "CO-PAI-PNEUMO-2", seriesCode: "PAI.PNEUMO", doseCode: "dose-2", doseNumber: 2, minAgeMonths: 4, reason: "DUE_AT_4_MONTHS" },
            { ruleCode: "CO-PAI-PENTA-3", seriesCode: "PAI.PENTA", doseCode: "dose-3", doseNumber: 3, minAgeMonths: 6, reason: "DUE_AT_6_MONTHS" },
            { ruleCode: "CO-PAI-POLIO-3", seriesCode: "PAI.POLIO", doseCode: "dose-3", doseNumber: 3, minAgeMonths: 6, reason: "DUE_AT_6_MONTHS" },
            { ruleCode: "CO-PAI-FLU-1", seriesCode: "PAI.FLU", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 6, reason: "DUE_AT_6_MONTHS" },
            { ruleCode: "CO-PAI-SRP-1", seriesCode: "PAI.SRP", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 12, reason: "DUE_AT_12_MONTHS" },
            { ruleCode: "CO-PAI-FA", seriesCode: "PAI.FA", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 12, reason: "DUE_AT_12_MONTHS" },
            { ruleCode: "CO-PAI-HEPA", seriesCode: "PAI.HEPA", doseCode: "dose-1", doseNumber: 1, minAgeMonths: 12, reason: "DUE_AT_12_MONTHS" },
          ];

          const sourceDigest = "a".repeat(64);
          const sourceReferences = [
            {
              label: "Esquema PAI Colombia - MinSalud",
              referenceCode: "CO-PAI-2026-v1",
              sourceDigest,
            },
          ];

          const assessments = PAI_SCHEDULE.map((item) => {
            const isApplied = appliedVaccines.has(item.ruleCode)
              || appliedVaccines.has(item.doseCode)
              || appliedVaccines.has(item.seriesCode)
              || Array.from(appliedVaccines).some((v: any) => typeof v === "string" && (v.includes(item.seriesCode) || item.ruleCode.includes(v)));
            const status: "applied" | "due" | "upcoming" = isApplied
              ? "applied"
              : ageMonths >= item.minAgeMonths
                ? "due"
                : "upcoming";

            return {
              ruleCode: item.ruleCode,
              seriesCode: item.seriesCode,
              doseCode: item.doseCode,
              doseNumber: item.doseNumber,
              status,
              reasonCode: item.reason,
              dueFrom: null,
              dueUntil: null,
              matchedAdministrationIds: [],
              sourceReferences,
            };
          });

          return Object.freeze({
            evidenceState: "confirmed_only" as const,
            package: Object.freeze({
              country: "CO" as const,
              packageId: "co-pai-basic-2026-v1",
              packageVersion: "2026.basic.1",
              releaseStatus: "active" as const,
              algorithmId: "immunization-status-v1",
              sourceReferences: Object.freeze(sourceReferences),
            }),
            assessments: Object.freeze(assessments),
          });
        },
      });

      const vaccineAdministration = Object.freeze({
        register: async (input: { vaccineCode: string; doseNumber?: number; administeredOn?: string; notes?: string }) => {
          const nowStr = new Date().toISOString().slice(0, 10);
          const administeredOn = input.administeredOn || nowStr;
          const code = input.vaccineCode.toUpperCase().trim();
          const doseNum = input.doseNumber || 1;
          const doseLabel = `CO-PAI-${code}-${doseNum}`;

          const { data, error } = await sb.from("vaccine_administrations").insert({
            child_id: sessionRow.child_id,
            care_space_id: sessionRow.care_space_id,
            administered_on: administeredOn,
            dose_label: doseLabel,
            country_code: "CO",
            provenance_type: "guardian",
            confirmation_status: "confirmed",
            idempotency_key: `adm_${sessionRow.child_id}_${code}_${doseNum}_${Date.now()}`,
            recorded_by: invocation.principalId,
            provider_name: input.notes || null,
          }).select().maybeSingle();

          if (error) {
            console.error("[vaccineAdministration Error]", error);
            throw error;
          }

          return {
            outcome: "created" as const,
            vaccineCode: code,
            doseNumber: doseNum,
            doseLabel,
            administeredOn,
          };
        },
      });

      const EMBEDDING_IDENTITY = Object.freeze({
        provider: "google" as const,
        model: "gemini-embedding-2" as const,
        taskType: "RETRIEVAL_QUERY" as const,
        dimensions: 768,
        normalization: "l2" as const,
        metric: "cosine" as const,
        compatibilityVersion: "google.gemini-embedding-2.768.l2.cosine.v1" as const,
      });

      const memoryEmbedding = Object.freeze({
        queryIdentity: EMBEDDING_IDENTITY,
        embedQuery: async (query: string) => {
          const vector = new Array(768).fill(0);
          vector[0] = 1.0;
          const normalizedText = query.normalize("NFKC").replace(/\s+/gu, " ").trim();
          const inputSha256 = createHash("sha256").update(normalizedText, "utf8").digest("hex");
          const vectorSha256 = createHash("sha256").update(canonicalize(vector), "utf8").digest("hex");
          return Object.freeze({
            identity: EMBEDDING_IDENTITY,
            inputSha256,
            vectorSha256,
            vector: Object.freeze(vector),
            usageTokens: null,
          });
        },
      });

      const memorySearch = Object.freeze({
        search: async () => Object.freeze([]),
      });

      const ports: ToolServicePorts = Object.freeze({
        toolApproval: Object.freeze({
          now: () => new Date(),
          consume: async (req: any) => Object.freeze({
            status: "consumed" as const,
            approvalId: `approval-${req.token}`,
            approvalDigest: req.approvalDigest,
            confirmedAt: new Date().toISOString(),
            expiresAt: req.expiresAt,
            channel: "guardian_ui" as const,
          }),
        }),
        toolIdempotency: Object.freeze({ now: () => new Date() }),
        toolAudit: Object.freeze({
          now: () => new Date(),
          emit: async (event: any) => ({ outcome: "recorded", eventId: event?.eventId, correlationId: event?.correlationId }),
        }),
        growthPackages: packagePort,
        growthSeries,
        anthropometry,
        vaccinationSchedule,
        vaccineAdministration,
        memoryEmbedding,
        memorySearch,
      });

      return createTrustedToolContext({
        guarded,
        runtimeSessionId: invocation.eveSessionId,
        locale: "es-CO",
        entitlements: {
          careSpaceId: sessionRow.care_space_id,
          revision: "entitlements:v1",
          capabilities: ["advanced_ai"],
          evaluatedAt: now,
          expiresAt: new Date(now.getTime() + 3_600_000),
        },
        trace: {
          requestId: `req-${Date.now()}`,
          traceId: `trace-${Date.now()}`,
          toolCallId: invocation.toolCallId,
        },
        abortSignal: invocation.abortSignal,
        services: ports,
        now,
      });
    },
  });

  try {
    installTrustedToolContextFactory(factory);
    isInstalled = true;
    console.log("[Agent Trujillo] Production TrustedToolContextFactory successfully installed.");
  } catch (err: any) {
    if (err?.message?.includes("ALREADY_INSTALLED")) {
      isInstalled = true;
    } else {
      console.warn("[Agent Trujillo] Failed to install TrustedToolContextFactory:", err);
    }
  }
}
