import { z } from "zod";

import { isCalendarDate } from "./calendar.ts";

const calendarDate = z.string().refine(isCalendarDate, "ISO calendar date");
const nonEmpty = z.string().trim().min(1).max(200);

const productQuery = z.object({
  regulatoryIdentifier: nonEmpty.optional(),
  productCode: nonEmpty.optional(),
  alias: nonEmpty.optional(),
}).strict().refine((value) => Object.values(value).some((entry) => entry !== undefined), "product query required");

export const vaccineAdministrationCommandSchema = z.object({
  administeredOn: calendarDate,
  product: productQuery,
  antigenCodes: z.array(nonEmpty).max(20).readonly().optional(),
  doseLabel: nonEmpty.optional(),
  lotNumber: nonEmpty.optional(),
  administrationSite: nonEmpty.optional(),
  providerName: nonEmpty.optional(),
  provenanceType: z.enum(["guardian", "professional", "import", "document", "chat"]),
}).strict();

export const calendarIntervalSchema = z.object({
  unit: z.enum(["days", "calendar_months", "calendar_years"]),
  value: z.number().int().nonnegative(),
}).strict();

export type VaccineAdministrationCommandInput = z.infer<typeof vaccineAdministrationCommandSchema>;
