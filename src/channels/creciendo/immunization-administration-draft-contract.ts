import { z } from "zod";

export const CRECIENDO_IMMUNIZATION_DRAFT_VERSION = "creciendo.immunization.draft.v1" as const;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "calendar_date");
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const SAFE_TEXT = z.string().min(1).max(160).refine((value) => (
  value === value.normalize("NFKC") && !/[\u0000-\u001f\u007f<>`]/u.test(value)
), "safe_text");

const ADMINISTRATION_DRAFT_REQUEST = z.object({
  version: z.literal(CRECIENDO_IMMUNIZATION_DRAFT_VERSION),
  administeredOn: DATE,
  productLabel: SAFE_TEXT.optional(),
  productIdentifier: CODE.optional(),
  doseLabel: SAFE_TEXT.optional(),
  lotNumber: SAFE_TEXT.optional(),
  location: SAFE_TEXT.optional(),
}).strict().refine((value) => value.productLabel !== undefined || value.productIdentifier !== undefined, "product_declaration_required");

export const IMMUNIZATION_ADMINISTRATION_DRAFT_RESPONSE_SCHEMA = z.object({
  version: z.literal(CRECIENDO_IMMUNIZATION_DRAFT_VERSION),
  requestId: CODE,
  outcome: z.enum(["created", "idempotent_replay"]),
  draftId: CODE,
  expiresAt: z.string().datetime({ offset: true }),
  confirmationRequired: z.literal(true),
}).strict();

export type ImmunizationAdministrationDraftRequest = Readonly<z.infer<typeof ADMINISTRATION_DRAFT_REQUEST>>;
export type ImmunizationAdministrationDraftResponse = Readonly<z.infer<typeof IMMUNIZATION_ADMINISTRATION_DRAFT_RESPONSE_SCHEMA>>;

export function parseAdministrationDraftRequest(raw: unknown): ImmunizationAdministrationDraftRequest | null {
  const parsed = ADMINISTRATION_DRAFT_REQUEST.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
