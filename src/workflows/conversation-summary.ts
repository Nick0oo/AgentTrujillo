import { FatalError, RetryableError } from "workflow";
import { z } from "zod";

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const SAFE_VERSION = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u);

const INPUT = z.object({
  ownerUserId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  sessionId: UUID,
  sourceSessionId: UUID,
  sourceDigest: DIGEST,
  cutoffAt: INSTANT,
  promptVersion: SAFE_VERSION,
  schemaVersion: SAFE_VERSION,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
}).strict();

export type ConversationSummaryInput = Readonly<z.infer<typeof INPUT>>;

export type ConversationMessage = Readonly<{
  id: string;
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  sessionId: string;
  sequence: number;
  actor: "guardian" | "assistant";
  status: "completed";
  occurredAt: string;
  text: string;
}>;

export type SummaryCitation = Readonly<{ messageId: string; start: number; end: number }>;
export type SummaryDraft = Readonly<{ text: string; citations: readonly SummaryCitation[] }>;

export interface ConversationSummaryPorts {
  loadMessages(input: ConversationSummaryInput): Promise<Readonly<{
    sessionState: "ordinary" | "urgent";
    messages: readonly ConversationMessage[];
  }>>;
  summarize(messages: readonly ConversationMessage[], input: ConversationSummaryInput): Promise<SummaryDraft>;
  persistCandidate(input: ConversationSummaryInput & Readonly<{
    text: string;
    citations: readonly SummaryCitation[];
    lifecycle: "pending";
  }>): Promise<Readonly<{ outcome: "created" | "idempotent_replay" | "conflict"; candidateId: string }>>;
}

export type LoadedSummary = Readonly<{
  status: "loaded";
  input: ConversationSummaryInput;
  messages: readonly ConversationMessage[];
}> | Readonly<{ status: "skipped"; reason: "urgent_session" }>;

export type SummaryGenerationResult = Readonly<{
  status: "draft";
  input: ConversationSummaryInput;
  draft: SummaryDraft;
}> | Readonly<{ status: "skipped"; reason: "urgent_session" }>;

export type ConversationSummaryResult =
  | Readonly<{ status: "skipped"; reason: "urgent_session" }>
  | Readonly<{ status: "persisted"; outcome: "created" | "idempotent_replay"; candidateId: string }>;

let ports: ConversationSummaryPorts | null = null;
const PORTS_KEY = Symbol.for("agent-trujillo.workflow.conversation-summary.ports");

type RuntimeGlobal = typeof globalThis & {
  [PORTS_KEY]?: ConversationSummaryPorts;
};

export function configureConversationSummaryPorts(value: ConversationSummaryPorts | null): void {
  ports = value;
  const runtimeGlobal = globalThis as RuntimeGlobal;
  if (value) runtimeGlobal[PORTS_KEY] = value;
  else delete runtimeGlobal[PORTS_KEY];
}

function parseInput(value: unknown): ConversationSummaryInput {
  const parsed = INPUT.safeParse(value);
  if (!parsed.success) throw new FatalError("SUMMARY_INVALID_INPUT");
  return Object.freeze(parsed.data);
}

function requirePorts(): ConversationSummaryPorts {
  const configured = ports ?? (globalThis as RuntimeGlobal)[PORTS_KEY];
  if (!configured) throw new FatalError("SUMMARY_RUNTIME_UNCONFIGURED");
  return configured;
}

function validateMessage(message: ConversationMessage, input: ConversationSummaryInput): boolean {
  return UUID.safeParse(message.id).success
    && message.ownerUserId === input.ownerUserId
    && message.careSpaceId === input.careSpaceId
    && message.childId === input.childId
    && message.sessionId === input.sourceSessionId
    && Number.isSafeInteger(message.sequence) && message.sequence > 0
    && (message.actor === "guardian" || message.actor === "assistant")
    && message.status === "completed"
    && INSTANT.safeParse(message.occurredAt).success
    && Date.parse(message.occurredAt) <= Date.parse(input.cutoffAt)
    && typeof message.text === "string"
    && message.text.length > 0 && message.text.length <= 8_000;
}

export async function loadEligibleMessages(rawInput: unknown): Promise<LoadedSummary> {
  "use step";
  const input = parseInput(rawInput);
  const runtime = requirePorts();
  let loaded: Awaited<ReturnType<ConversationSummaryPorts["loadMessages"]>>;
  try {
    loaded = await runtime.loadMessages(input);
  } catch {
    throw new RetryableError("SUMMARY_SOURCE_UNAVAILABLE", { retryAfter: "10s" });
  }
  if (loaded.sessionState === "urgent") return Object.freeze({ status: "skipped", reason: "urgent_session" });
  if (!Array.isArray(loaded.messages) || loaded.messages.length === 0 || loaded.messages.length > 100) {
    throw new FatalError("SUMMARY_SOURCE_INVALID");
  }
  const messages = [...loaded.messages]
    .filter((message) => validateMessage(message, input))
    .sort((left, right) => left.sequence - right.sequence);
  if (messages.length !== loaded.messages.length) throw new FatalError("SUMMARY_SCOPE_MISMATCH");
  return Object.freeze({ status: "loaded", input, messages: Object.freeze(messages) });
}

export async function generateCandidateSummary(loaded: LoadedSummary): Promise<SummaryGenerationResult> {
  "use step";
  if (loaded.status === "skipped") return loaded;
  const runtime = requirePorts();
  let draft: SummaryDraft;
  try {
    draft = await runtime.summarize(loaded.messages, loaded.input);
  } catch {
    throw new RetryableError("SUMMARY_PROVIDER_UNAVAILABLE", { retryAfter: "30s" });
  }
  if (!draft || typeof draft.text !== "string" || draft.text.trim().length === 0 || draft.text.length > 2_000) {
    throw new FatalError("SUMMARY_OUTPUT_INVALID");
  }
  return Object.freeze({ status: "draft", input: loaded.input, draft: Object.freeze({ ...draft, citations: Object.freeze([...draft.citations]) }) });
}

function assertCandidatePolicy(value: Readonly<{ text: string; citations: readonly SummaryCitation[] }>): SummaryDraft {
  const unsafe = /\b(?:diagnos(?:e|is|ed)|prescrib(?:e|ing)|prescription|dosage|dosis|tratamiento|treat)\b/iu;
  if (typeof value.text !== "string" || value.text.trim().length === 0 || value.text.length > 2_000
    || !Array.isArray(value.citations) || value.citations.length === 0 || value.citations.length > 16
    || unsafe.test(value.text)) throw new FatalError("SUMMARY_POLICY_REJECTED");
  if (!value.citations.every((citation) => UUID.safeParse(citation.messageId).success
    && Number.isInteger(citation.start) && citation.start >= 0
    && Number.isInteger(citation.end) && citation.end > citation.start)) {
    throw new FatalError("SUMMARY_CITATION_INVALID");
  }
  return Object.freeze({ text: value.text.trim(), citations: Object.freeze([...value.citations]) });
}

export async function validateCandidatePolicy(value: Readonly<{ text: string; citations: readonly SummaryCitation[] }>): Promise<SummaryDraft> {
  "use step";
  return assertCandidatePolicy(value);
}

export async function persistCandidates(value: Readonly<{
  status: "draft";
  input: ConversationSummaryInput;
  draft: SummaryDraft;
}> | LoadedSummary): Promise<ConversationSummaryResult> {
  "use step";
  if (value.status === "skipped") return value;
  if (value.status !== "draft") throw new FatalError("SUMMARY_DRAFT_REQUIRED");
  const runtime = requirePorts();
  const draft = assertCandidatePolicy(value.draft);
  let persisted: Awaited<ReturnType<ConversationSummaryPorts["persistCandidate"]>>;
  try {
    persisted = await runtime.persistCandidate(Object.freeze({ ...value.input, ...draft, lifecycle: "pending" as const }));
  } catch {
    throw new RetryableError("SUMMARY_STORAGE_UNAVAILABLE", { retryAfter: "10s" });
  }
  if (persisted.outcome === "conflict" || !UUID.safeParse(persisted.candidateId).success) {
    throw new FatalError("SUMMARY_REPLAY_CONFLICT");
  }
  return Object.freeze({ status: "persisted", outcome: persisted.outcome, candidateId: persisted.candidateId });
}

export async function conversationSummaryWorkflow(rawInput: ConversationSummaryInput): Promise<ConversationSummaryResult> {
  "use workflow";
  const loaded = await loadEligibleMessages(rawInput);
  if (loaded.status === "skipped") return loaded;
  const generated = await generateCandidateSummary(loaded);
  if (generated.status !== "draft") return generated;
  const checked = await validateCandidatePolicy(generated.draft);
  return persistCandidates(Object.freeze({ status: "draft", input: generated.input, draft: checked }));
}

export async function startConversationSummary(
  rawInput: ConversationSummaryInput,
  start: (input: ConversationSummaryInput) => Promise<Readonly<{ runId: string }>>,
): Promise<Readonly<{ runId: string }>> {
  const input = parseInput(rawInput);
  const result = await start(input);
  if (!result || typeof result.runId !== "string" || !/^wrun_[A-Za-z0-9._:-]{1,127}$/u.test(result.runId)) {
    throw new Error("SUMMARY_START_INVALID");
  }
  return Object.freeze({ runId: result.runId });
}
