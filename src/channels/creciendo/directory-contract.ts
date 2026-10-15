import { z } from "zod";

const UUID = z.string().uuid();
const SAFE_TEXT = z.string().min(1).max(160).refine(
  (value) => value === value.normalize("NFKC") && !/[\u0000-\u001f\u007f\p{Cf}\p{Cs}]/u.test(value),
  "unsafe_text",
);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const TIME_ZONE = z.string().min(3).max(64).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "invalid_time_zone");

export const DIRECTORY_VERSION = "creciendo.directory.v1" as const;
export const DASHBOARD_VERSION = "creciendo.dashboard.v1" as const;

const CHILD_SCHEMA = z.object({
  childId: UUID,
  displayName: SAFE_TEXT,
  birthDate: DATE,
  countryOfCare: z.enum(["CO", "US"]),
  timeZone: TIME_ZONE,
}).strict();

const CARE_SPACE_SCHEMA = z.object({
  careSpaceId: UUID,
  name: SAFE_TEXT,
  countryOfCare: z.enum(["CO", "US"]),
  timeZone: TIME_ZONE,
  children: z.array(CHILD_SCHEMA).max(32),
}).strict();

export const CHILD_DIRECTORY_RESPONSE_SCHEMA = z.object({
  version: z.literal(DIRECTORY_VERSION),
  requestId: z.string().min(1).max(128),
  careSpaces: z.array(CARE_SPACE_SCHEMA).max(16),
}).strict();

const VALUE_SCHEMA = z.number().finite().nonnegative().nullable();

export const DASHBOARD_RESPONSE_SCHEMA = z.object({
  version: z.literal(DASHBOARD_VERSION),
  requestId: z.string().min(1).max(128),
  scopeVersion: z.literal("authorized-child-scope.v1"),
  child: z.object({
    childId: UUID,
    displayName: SAFE_TEXT,
    birthDate: DATE,
    countryOfCare: z.enum(["CO", "US"]),
    timeZone: TIME_ZONE,
  }).strict(),
  nextActions: z.array(z.object({
    id: z.string().min(1).max(128),
    title: SAFE_TEXT.max(256),
    subtitle: SAFE_TEXT.max(512).nullable(),
    priority: z.enum(["high", "medium", "low"]),
  }).strict()).max(16),
  growth: z.object({
    lastWeightKg: VALUE_SCHEMA,
    lastHeightCm: VALUE_SCHEMA,
    measuredAt: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  immunization: z.object({
    pendingCount: z.number().int().nonnegative().nullable(),
    nextDueDate: DATE.nullable(),
  }).strict(),
  medication: z.object({
    activePlanCount: z.number().int().nonnegative().nullable(),
  }).strict(),
  development: z.object({
    recentObservationCount: z.number().int().nonnegative().nullable(),
  }).strict(),
  nutrition: z.object({
    stageLabel: SAFE_TEXT.nullable(),
  }).strict(),
  generatedAt: z.string().datetime({ offset: true }),
}).strict();

export type ChildDirectoryResponse = Readonly<z.infer<typeof CHILD_DIRECTORY_RESPONSE_SCHEMA>>;
export type DashboardResponse = Readonly<z.infer<typeof DASHBOARD_RESPONSE_SCHEMA>>;
