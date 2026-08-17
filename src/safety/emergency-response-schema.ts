import { z } from "zod";

export const emergencyPublicResponseSchema = z.object({
  type: z.literal("emergency_recommendation"),
  text: z.string().min(1).max(280),
  locale: z.enum(["es-CO", "en-US"]),
  messageId: z.string().regex(/^emergency-[a-z0-9_.-]{1,96}$/),
}).strict();

export type EmergencyPublicResponse = z.infer<typeof emergencyPublicResponseSchema>;
