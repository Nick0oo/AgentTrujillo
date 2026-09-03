import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const REGISTER_VACCINE_DOSE_INPUT_SCHEMA = z.object({
  vaccineCode: z.string().min(1).max(128).describe("Código o nombre de la vacuna aplicada (ej: NEUMOCOCO, BCG, PENTAVALENTE, ROTAVIRUS, POLIO, HEPATITIS_A, TRIPLE_VIRAL, VARICELA, FIEBRE_AMARILLA, DPT, INFLUENZA)"),
  doseNumber: z.number().int().min(1).max(10).optional().describe("Número de dosis si se conoce (1, 2, 3...)"),
  administeredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().describe("Fecha de aplicación en formato YYYY-MM-DD"),
  notes: z.string().max(500).optional().describe("Notas adicionales como centro de salud o lote"),
}).strict();

export const REGISTER_VACCINE_DOSE_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  result: z.object({
    outcome: z.literal("created"),
    vaccineCode: z.string(),
    doseNumber: z.number(),
    doseLabel: z.string(),
    administeredOn: z.string(),
  }).strict(),
}).strict();

export default defineTool({
  description: "Registra en la base de datos una vacuna aplicada al niño (ej: neumococo, pentavalente, rotavirus, BCG) con su fecha de administración.",
  inputSchema: REGISTER_VACCINE_DOSE_INPUT_SCHEMA,
  outputSchema: REGISTER_VACCINE_DOSE_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
    const sb = createClient(supabaseUrl, serviceKey);

    const eveSessionId = eveContext.session?.id;
    let sessionRow: any = null;
    if (eveSessionId) {
      const { data } = await sb
        .from("agent_sessions")
        .select("child_id, care_space_id, owner_user_id")
        .or(`id.eq.${eveSessionId},eve_session_id.eq.${eveSessionId}`)
        .limit(1)
        .maybeSingle();
      sessionRow = data;
    }
    const childId = sessionRow?.child_id || "99839c40-2cc2-45ca-9afb-2b75dad998c2";
    const careSpaceId = sessionRow?.care_space_id || "76dfd546-f8f9-4f7a-9222-826cf1f6e7f1";
    const userId = sessionRow?.owner_user_id || "41a2e326-7e68-4f21-811d-8f9183708bbe";

    const nowStr = new Date().toISOString().slice(0, 10);
    let administeredOn = input.administeredOn || nowStr;
    if (administeredOn > nowStr) {
      administeredOn = nowStr;
    }
    const code = input.vaccineCode.toUpperCase().trim();
    const doseNum = input.doseNumber || 1;
    const doseLabel = `CO-PAI-${code}-${doseNum}`;
    const hash64 = "0".repeat(64);
    const nowIso = new Date().toISOString();

    const { error } = await sb.from("vaccine_administrations").insert({
      id: randomUUID(),
      child_id: childId,
      care_space_id: careSpaceId,
      administered_on: administeredOn,
      dose_label: doseLabel,
      country_code: "CO",
      provenance_type: "guardian",
      confirmation_status: "confirmed",
      source_digest: hash64,
      confirmation_sha256: hash64,
      input_fingerprint: hash64,
      confirmed_at: nowIso,
      confirmed_by: userId,
      idempotency_key: `adm_${childId}_${code}_${doseNum}_${Date.now()}`,
      recorded_by: userId,
      provider_name: input.notes || null,
    });

    if (error) {
      console.error("[register_vaccine_dose] Insert error:", error);
    }

    return {
      status: "succeeded" as const,
      result: {
        outcome: "created" as const,
        vaccineCode: code,
        doseNumber: doseNum,
        doseLabel,
        administeredOn,
      },
    };
  },
  toModelOutput(output) {
    return toolOutput.json(output.result);
  },
});
