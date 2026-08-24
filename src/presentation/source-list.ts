import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import { createCitationHandle } from "../../agent/lib/runtime/safe-to-model";
import {
  REGISTERED_TOOL_IDS,
  type RegisteredToolId,
} from "../../agent/lib/runtime/tool-permission-policy";

const MAX_SOURCES = 32;
const LOCALE = z.enum(["es-CO", "en-US"]);
const HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const CODE = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u);
const TOOL_ID = z.enum(REGISTERED_TOOL_IDS);
const JURISDICTION = z.enum(["CO", "US", "GLOBAL"]);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "calendar_date");
const CONTROL = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const EXECUTABLE = /(?:[<>`]|\b(?:javascript|data|file):|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\]|(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula).{0,80}(?:previous|prior|system|instruction|prompt|policy|anteriores?|sistema|instrucciones?|pol[ií]tica))/iu;

function safeText(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL.test(value)
    && !EXECUTABLE.test(value);
}

const DISPLAY_TEXT = z.string().min(1).max(16_000).refine(safeText, "unsafe_text");
const TITLE = DISPLAY_TEXT.max(240).refine((value) => !/\b(?:https?|s3|gs):\/\//iu.test(value), "title_url_forbidden");
const VERSION_LABEL = DISPLAY_TEXT.max(120);
const PACKAGE_DIGESTS = z.array(HASH).max(16).readonly().superRefine((values, context) => {
  if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: "duplicate_package_digest" });
});

const ENTRY_BASE = {
  citationHandle: HANDLE,
  toolId: TOOL_ID,
  referenceCode: CODE,
  title: TITLE,
  jurisdiction: JURISDICTION,
  versionLabel: VERSION_LABEL,
  versionDate: DATE,
  effectiveFrom: DATE.nullable(),
  effectiveUntil: DATE.nullable(),
  accessedOn: DATE,
  sourceDigest: HASH,
  packageDigests: PACKAGE_DIGESTS,
  current: z.literal(true),
  revoked: z.literal(false),
} as const;

const PUBLIC_SOURCE_SCHEMA = z.object({
  kind: z.literal("public_clinical_source"),
  ...ENTRY_BASE,
  canonicalUrl: z.string().min(1).max(2_048),
}).strict();

const PRIVATE_SOURCE_SCHEMA = z.object({
  kind: z.literal("private_evidence"),
  ...ENTRY_BASE,
}).strict();

export const SOURCE_REGISTRY_ENTRY_SCHEMA = z.discriminatedUnion("kind", [
  PUBLIC_SOURCE_SCHEMA,
  PRIVATE_SOURCE_SCHEMA,
]).superRefine((entry, context) => {
  if (entry.effectiveFrom !== null && entry.effectiveUntil !== null && entry.effectiveUntil < entry.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "effective_window_order" });
  }
  if (entry.packageDigests.join("\u0000") !== [...entry.packageDigests].sort().join("\u0000")) {
    context.addIssue({ code: "custom", path: ["packageDigests"], message: "package_digest_order" });
  }
});

const PUBLIC_LINK_SCHEMA = z.object({
  kind: z.literal("public_https"),
  href: z.string().url().refine((value) => value.startsWith("https://"), "https_link"),
  label: DISPLAY_TEXT.max(120),
}).strict();
const PRIVATE_LINK_SCHEMA = z.object({
  kind: z.literal("not_clickable"),
  href: z.null(),
  label: DISPLAY_TEXT.max(120),
}).strict();

const SOURCE_OUTPUT_SCHEMA = z.object({
  id: z.string().regex(/^source-[0-9]{3}$/u),
  citationHandle: HANDLE,
  visibility: z.enum(["public", "private"]),
  title: TITLE,
  jurisdiction: z.object({ code: JURISDICTION, label: DISPLAY_TEXT.max(120) }).strict(),
  version: z.object({ label: VERSION_LABEL, date: DATE }).strict(),
  effective: z.object({
    from: DATE.nullable(),
    until: DATE.nullable(),
    label: DISPLAY_TEXT.max(280),
  }).strict(),
  accessed: z.object({ date: DATE, label: DISPLAY_TEXT.max(200) }).strict(),
  link: z.discriminatedUnion("kind", [PUBLIC_LINK_SCHEMA, PRIVATE_LINK_SCHEMA]),
  trustedMetadata: z.object({
    toolId: TOOL_ID,
    referenceCode: CODE,
    sourceDigest: HASH,
    packageDigests: PACKAGE_DIGESTS,
  }).strict(),
}).strict();

export const SOURCE_LIST_WIDGET_SCHEMA = z.object({
  kind: z.literal("source_list"),
  version: z.literal("sources.list.v1"),
  data: z.object({
    locale: LOCALE,
    title: DISPLAY_TEXT.max(160),
    sources: z.array(SOURCE_OUTPUT_SCHEMA).max(MAX_SOURCES),
    screenReaderSummary: DISPLAY_TEXT,
    fallbackText: DISPLAY_TEXT,
  }).strict(),
}).strict();

export type SourceRegistryEntry = Readonly<z.infer<typeof SOURCE_REGISTRY_ENTRY_SCHEMA>>;
export type SourceListWidget = Readonly<z.infer<typeof SOURCE_LIST_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE>;

export class SourceListPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Source list presentation contract invalid");
    this.name = "SourceListPresentationError";
  }
}

const ALLOWED_HOSTS = Object.freeze([
  "who.int",
  "cdc.gov",
  "minsalud.gov.co",
  "invima.gov.co",
  "icbf.gov.co",
  "aap.org",
  "nlm.nih.gov",
  "fda.gov",
  "nice.org.uk",
  "funcionpublica.gov.co",
  "hhs.gov",
  "ftc.gov",
] as const);
const TRACKING_PARAMETER = /^(?:utm_.+|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid)$/iu;
const SENSITIVE_PARAMETER = /(?:token|secret|key|signature|credential|authorization|session|password|signed|x-amz|x-goog|expires?)/iu;
const REDIRECT_PARAMETER = /^(?:redirect|redirect_uri|return|return_to|next|url|uri|href|target|destination|dest)$/iu;
const SECRETISH_VALUE = /(?:^eyJ[A-Za-z0-9_-]{16,}\.|^[A-Za-z0-9_-]{48,}$)/u;

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Fuentes",
    publicLink: "Abrir fuente pública",
    privateLink: "Fuente privada",
    jurisdiction: Object.freeze({ CO: "Colombia", US: "Estados Unidos", GLOBAL: "Global" }),
    effective: (from: string | null, until: string | null) => from === null
      ? "Vigencia no indicada"
      : until === null ? `Fecha efectiva: ${from}` : `Vigencia: ${from} a ${until}`,
    accessed: (date: string) => `Consultada: ${date}`,
    summary: (count: number) => `${count} ${count === 1 ? "fuente" : "fuentes"} en este resultado.`,
  }),
  "en-US": Object.freeze({
    title: "Sources",
    publicLink: "Open public source",
    privateLink: "Private source",
    jurisdiction: Object.freeze({ CO: "Colombia", US: "United States", GLOBAL: "Global" }),
    effective: (from: string | null, until: string | null) => from === null
      ? "Effective date not provided"
      : until === null ? `Effective date: ${from}` : `Effective window: ${from} to ${until}`,
    accessed: (date: string) => `Accessed: ${date}`,
    summary: (count: number) => `${count} ${count === 1 ? "source" : "sources"} in this result.`,
  }),
});

function fail(): never {
  throw new SourceListPresentationError();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function allowedHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase("en-US");
  return ALLOWED_HOSTS.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

function canonicalPublicUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail();
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || !allowedHost(parsed.hostname)) return fail();
  if (parsed.hash !== "" || parsed.port !== "" || parsed.pathname.includes("\\") || /(?:^|\/)\.\.(?:\/|$)/u.test(parsed.pathname)) return fail();
  for (const [key, value] of [...parsed.searchParams.entries()]) {
    if (SENSITIVE_PARAMETER.test(key) || REDIRECT_PARAMETER.test(key) || SECRETISH_VALUE.test(value)) return fail();
    if (TRACKING_PARAMETER.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  const canonical = parsed.toString();
  if (canonical.length > 2_048 || /(?:javascript|data|file):/iu.test(canonical)) return fail();
  return canonical;
}

function sameEntry(left: SourceRegistryEntry, right: SourceRegistryEntry): boolean {
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

function assertHandle(entry: SourceRegistryEntry): void {
  try {
    const expected = createCitationHandle(entry.toolId as RegisteredToolId, {
      sourceDigest: entry.sourceDigest,
      referenceCode: entry.referenceCode,
    });
    if (expected !== entry.citationHandle) fail();
  } catch {
    fail();
  }
}

function sourceSortKey(entry: SourceRegistryEntry): string {
  return `${entry.title.normalize("NFKC").toLocaleLowerCase("en-US")}\u0000${entry.citationHandle}`;
}

export function presentSourceList(rawHandles: unknown, rawRegistry: unknown, rawLocale: unknown): SourceListWidget {
  const handles = z.array(HANDLE).max(MAX_SOURCES).safeParse(rawHandles);
  const registry = z.array(SOURCE_REGISTRY_ENTRY_SCHEMA).max(128).safeParse(rawRegistry);
  const localeResult = LOCALE.safeParse(rawLocale);
  if (!handles.success || !registry.success || !localeResult.success) return fail();
  const locale = localeResult.data;
  const byHandle = new Map<string, SourceRegistryEntry>();
  for (const entry of registry.data) {
    assertHandle(entry);
    const previous = byHandle.get(entry.citationHandle);
    if (previous && !sameEntry(previous, entry)) return fail();
    if (!previous) byHandle.set(entry.citationHandle, entry);
  }
  const requested = [...new Set(handles.data)];
  const resolved = requested.map((handle) => byHandle.get(handle) ?? fail());
  resolved.sort((left, right) => {
    const a = sourceSortKey(left);
    const b = sourceSortKey(right);
    return a === b ? 0 : a < b ? -1 : 1;
  });

  const copy = COPY[locale];
  const sources = resolved.map((entry, index) => {
    const effectiveLabel = copy.effective(entry.effectiveFrom, entry.effectiveUntil);
    const accessedLabel = copy.accessed(entry.accessedOn);
    return {
      id: `source-${String(index + 1).padStart(3, "0")}`,
      citationHandle: entry.citationHandle,
      visibility: entry.kind === "public_clinical_source" ? "public" as const : "private" as const,
      title: entry.title,
      jurisdiction: { code: entry.jurisdiction, label: copy.jurisdiction[entry.jurisdiction] },
      version: { label: entry.versionLabel, date: entry.versionDate },
      effective: { from: entry.effectiveFrom, until: entry.effectiveUntil, label: effectiveLabel },
      accessed: { date: entry.accessedOn, label: accessedLabel },
      link: entry.kind === "public_clinical_source"
        ? { kind: "public_https" as const, href: canonicalPublicUrl(entry.canonicalUrl), label: copy.publicLink }
        : { kind: "not_clickable" as const, href: null, label: copy.privateLink },
      trustedMetadata: {
        toolId: entry.toolId,
        referenceCode: entry.referenceCode,
        sourceDigest: entry.sourceDigest,
        packageDigests: [...entry.packageDigests],
      },
    };
  });
  const summary = copy.summary(sources.length);
  const fallbackText = [
    summary,
    ...sources.map((source) => [
      source.title,
      source.jurisdiction.label,
      `${source.version.label}: ${source.version.date}`,
      source.effective.label,
      source.accessed.label,
      source.link.kind === "public_https" ? source.link.href : source.link.label,
    ].join("; ")),
  ].join(" ");
  const parsed = SOURCE_LIST_WIDGET_SCHEMA.safeParse({
    kind: "source_list",
    version: "sources.list.v1",
    data: { locale, title: copy.title, sources, screenReaderSummary: summary, fallbackText },
  });
  if (!parsed.success) return fail();
  return deepFreeze(parsed.data);
}
