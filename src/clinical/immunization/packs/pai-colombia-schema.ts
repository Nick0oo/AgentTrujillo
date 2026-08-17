import { z } from "zod";

export type PaiRuleKind = "routine" | "catch_up" | "special_population" | "campaign" | "outbreak" | "review_only";
export const paiColombiaPackSchema = z.object({
  packageId: z.string().min(1), version: z.string().min(1), effectiveFrom: z.string(), effectiveUntil: z.string().nullable(),
  status: z.enum(["candidate", "approved", "retired"]), approvalState: z.enum(["blocked", "approved"]),
  sourceReferences: z.array(z.object({ id: z.string().min(1), uri: z.string().url(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), rules: z.array(z.unknown()), dependencies: z.array(z.unknown()),
}).strict();
