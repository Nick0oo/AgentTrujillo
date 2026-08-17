import { z } from "zod";

export const allowedResponsePartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("educational"), text: z.string().min(1).max(8_000), sourceIds: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{0,95}$/)).max(32) }).strict(),
  z.object({ kind: z.literal("deterministic_result"), text: z.string().min(1).max(8_000), warnings: z.array(z.string().regex(/^[A-Z0-9_.-]{1,64}$/)).max(32) }).strict(),
  z.object({ kind: z.literal("approved_terminal"), terminalType: z.enum(["emergency_recommendation", "pediatrician_recommendation"]), text: z.string().min(1).max(280), locale: z.enum(["es-CO", "en-US"]), messageId: z.string().regex(/^[a-z0-9_.-]{1,128}$/) }).strict(),
]);

export type AllowedResponseContract = z.infer<typeof allowedResponsePartSchema>;
export type ClinicalResponseMode = AllowedResponseContract["kind"] | "abstain";
