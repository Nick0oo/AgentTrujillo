import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { canonicalize } from "json-canonicalize";
import { base64url } from "jose";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope.ts";
import type { AuthenticatedGuardian } from "../../agent/lib/access/authenticated-guardian.ts";
import type { OwnedSessionRecord } from "../../agent/lib/access/session-record.ts";
import type { AuthenticatedChannelRequest } from "../../src/channels/creciendo/auth-middleware.ts";
import { createContinuationTokenKeyRing } from "../../src/channels/creciendo/continuation-token.ts";
import { encodeNdjsonEvent } from "../../src/channels/creciendo/ndjson-encoder.ts";
import { handleCancelSession, type SessionCancelRouteDependencies } from "../../src/channels/creciendo/routes/session-cancel.ts";
import { handleCreateSession, INITIAL_EVENT_CURSOR, type SessionCreateRouteDependencies } from "../../src/channels/creciendo/routes/session-create.ts";
import { handleSessionMessage, type SessionMessageRouteDependencies } from "../../src/channels/creciendo/routes/session-message.ts";
import {
  handleSessionStream,
  type PersistedChannelEvent,
  type SessionStreamRouteDependencies,
} from "../../src/channels/creciendo/routes/session-stream.ts";
import { parseChannelEvent, type ChannelEvent } from "../../src/channels/creciendo/types.ts";
import { compileRedFlagPack } from "../../src/safety/compile-red-flag-pack.ts";
import { SafetyPreflight } from "../../src/safety/preflight.ts";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../src/safety/safety-context.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VITEST = fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("../fixtures/channel/creciendo-v1.ndjson", import.meta.url));

const EXPECTED_EVENT_TYPES = Object.freeze([
  "text-delta",
  "tool-state",
  "ui-part",
  "citation",
  "heartbeat",
  "message-complete",
  "session-cancelled",
  "emergency-recommendation",
  "stream-error",
]);

type VitestAssertion = Readonly<{ fullName: string; status: string }>;
type VitestFile = Readonly<{ assertionResults: readonly VitestAssertion[] }>;
type VitestJson = Readonly<{
  success: boolean;
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: readonly VitestFile[];
}>;

type VerificationRun = Readonly<{
  suites: number;
  passedSuites: number;
  tests: number;
  passedTests: number;
  failedTests: number;
  assertions: readonly Readonly<{ name: string; status: string }>[];
  digestSha256: string;
}>;

type EvalCase = Readonly<{
  id: string;
  boundary: "transport" | "isolation" | "replay" | "cancellation" | "privacy" | "clinical";
  critical: true;
  passed: boolean;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseVitestReport(raw: string): VitestJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("channel_suite_report_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("channel_suite_report_invalid");
  }
  const report = parsed as Partial<VitestJson>;
  if (report.success !== true
    || !Number.isSafeInteger(report.numTotalTestSuites)
    || !Number.isSafeInteger(report.numPassedTestSuites)
    || report.numFailedTestSuites !== 0
    || !Number.isSafeInteger(report.numTotalTests)
    || !Number.isSafeInteger(report.numPassedTests)
    || report.numFailedTests !== 0
    || !Array.isArray(report.testResults)) {
    throw new Error("channel_suite_failed");
  }
  return report as VitestJson;
}

function runChannelSuite(): VerificationRun {
  const result = spawnSync(process.execPath, [VITEST, "run", "tests/channels", "--reporter=json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    maxBuffer: 16 * 1_024 * 1_024,
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("channel_suite_failed");
  const report = parseVitestReport(result.stdout);
  const assertions = report.testResults
    .flatMap((file) => file.assertionResults)
    .map((assertion) => Object.freeze({ name: assertion.fullName, status: assertion.status }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (assertions.length !== report.numTotalTests || assertions.some((entry) => entry.status !== "passed")) {
    throw new Error("channel_suite_failed");
  }
  const stable = Object.freeze({
    suites: report.numTotalTestSuites,
    passedSuites: report.numPassedTestSuites,
    tests: report.numTotalTests,
    passedTests: report.numPassedTests,
    failedTests: report.numFailedTests,
    assertions: Object.freeze(assertions),
  });
  return Object.freeze({ ...stable, digestSha256: sha256(canonicalize(stable)) });
}

function loadFixture(): Readonly<{ raw: string; lines: readonly string[]; events: readonly ChannelEvent[] }> {
  const raw = readFileSync(FIXTURE, "utf8");
  if (!raw.endsWith("\n") || raw.includes("\r")) throw new Error("fixture_framing_invalid");
  const lines = raw.slice(0, -1).split("\n");
  const events = lines.map((line) => parseChannelEvent(JSON.parse(line)));
  return Object.freeze({ raw, lines: Object.freeze(lines), events: Object.freeze(events) });
}

function hasAssertion(run: VerificationRun, text: string): boolean {
  return run.assertions.some((assertion) => assertion.name.includes(text));
}

function everyReconnectBoundary(events: readonly ChannelEvent[]): boolean {
  const sessions = new Map<string, ChannelEvent[]>();
  for (const event of events) sessions.set(event.sessionId, [...(sessions.get(event.sessionId) ?? []), event]);
  for (const stream of sessions.values()) {
    for (let cut = 0; cut <= stream.length; cut += 1) {
      const acknowledged = stream.slice(0, cut);
      const afterSequence = acknowledged.at(-1)?.sequence ?? 0;
      const replay = stream.filter((event) => event.sequence > afterSequence);
      const reconstructed = [...acknowledged, ...replay];
      if (reconstructed.length !== stream.length
        || reconstructed.some((event, index) => event.eventId !== stream[index]?.eventId)) return false;
    }
  }
  return true;
}

function fixtureCases(run: VerificationRun, httpSmokePassed: boolean): readonly EvalCase[] {
  const fixture = loadFixture();
  const types = new Set(fixture.events.map((event) => event.type));
  const exactBytes = fixture.events.every((event, index) => (
    new TextDecoder().decode(encodeNdjsonEvent(event)) === `${fixture.lines[index]}\n`
  ));
  const terminals = new Map<string, boolean>();
  let terminalOrder = true;
  for (const event of fixture.events) {
    if (terminals.get(event.sessionId)) terminalOrder = false;
    if (event.terminal) terminals.set(event.sessionId, true);
  }
  const emergency = fixture.events.find((event) => event.type === "emergency-recommendation");
  const emergencyOnly = emergency !== undefined
    && fixture.events.filter((event) => event.sessionId === emergency.sessionId).length === 1
    && !/(?:action|button|url|phone|location|notification|appointment|handoff)/iu.test(JSON.stringify(emergency));
  const cancellation = fixture.events.find((event) => event.type === "session-cancelled");
  const safeCancellation = cancellation?.data.outcome === "effect_may_have_committed"
    && cancellation.data.effectState === "unknown";
  const privatePattern = /(?:reasoning|systemPrompt|developerInstructions|raw(?:Input|Output|Arguments|Result|Tool|Provider)|providerFrame|serviceRole|bearerToken|childId|careSpaceId|ownerUserId)/iu;

  return Object.freeze([
    { id: "authenticated-http-create-message-stream-reconnect-cancel", boundary: "transport", critical: true, passed: httpSmokePassed },
    { id: "runtime-valid-canonical-bounded-ndjson", boundary: "transport", critical: true, passed: exactBytes && fixture.lines.length === fixture.events.length },
    { id: "all-nine-public-event-types", boundary: "transport", critical: true, passed: EXPECTED_EVENT_TYPES.length === types.size && EXPECTED_EVENT_TYPES.every((type) => types.has(type as ChannelEvent["type"])) },
    { id: "terminal-event-closes-each-stream", boundary: "transport", critical: true, passed: terminalOrder },
    { id: "disconnect-reconnect-at-every-fixture-boundary", boundary: "replay", critical: true, passed: everyReconnectBoundary(fixture.events) },
    { id: "cursor-retention-forgery-and-order-suite", boundary: "replay", critical: true, passed: hasAssertion(run, "rejects unsupported versions, forged continuations, invalid cursors and retention gaps") && hasAssertion(run, "malformed, duplicated or out of order") },
    { id: "reconnect-does-not-repeat-effects", boundary: "replay", critical: true, passed: hasAssertion(run, "authorizes and resolves the cursor before headers, then emits only later persisted events") && hasAssertion(run, "never redispatches its replay") },
    { id: "slow-client-backpressure-and-disconnect", boundary: "transport", critical: true, passed: hasAssertion(run, "honors ReadableStream backpressure") && hasAssertion(run, "disposes promptly when the reader disconnects") },
    { id: "concurrent-idempotency-and-principal-isolation", boundary: "isolation", critical: true, passed: hasAssertion(run, "isolates concurrent principals") && hasAssertion(run, "converges concurrent identical persistence attempts") },
    { id: "sibling-foreign-revoked-expired-guessed-denied", boundary: "isolation", critical: true, passed: hasAssertion(run, "missing, sibling, foreign-space and revoked authorization indistinguishable") && hasAssertion(run, "forged/expired/revoked/sibling context uniformly") && hasAssertion(run, "denies guessed sessions, forged continuations and live revocation") },
    { id: "token-and-cursor-tampering-denied", boundary: "isolation", critical: true, passed: hasAssertion(run, "denies tamper, wrong session/actor/space/child/security version") && hasAssertion(run, "expiry, not-before, audience, type, algorithm and key id") },
    { id: "revocation-discards-queued-frames", boundary: "isolation", critical: true, passed: hasAssertion(run, "discards queued/live frames and aborts Eve exactly once") && hasAssertion(run, "provider failure before cursor lookup and headers") },
    { id: "cancellation-preserves-ambiguous-effect-truth", boundary: "cancellation", critical: true, passed: safeCancellation && hasAssertion(run, "accepts the durable ticket before signaling the exact Eve turn") && hasAssertion(run, "never signals Eve or appends another terminal event") },
    { id: "emergency-is-one-terminal-without-llm-tool-workflow", boundary: "clinical", critical: true, passed: emergencyOnly && hasAssertion(run, "persists one emergency-only terminal event with no Eve, model, tool or workflow invocation") },
    { id: "reasoning-provider-tool-payload-deny-first", boundary: "privacy", critical: true, passed: !privatePattern.test(fixture.raw) && hasAssertion(run, "suppresses reasoning, prompts, provider frames, continuations, subagents, and model results") && hasAssertion(run, "without arguments or results") },
    { id: "safe-provider-persistence-failure-projection", boundary: "privacy", critical: true, passed: hasAssertion(run, "transient pre-header provider failure") && hasAssertion(run, "preserves conflict/unknown persistence truth") },
  ] satisfies readonly EvalCase[]);
}

async function runSyntheticHttpSmoke(): Promise<boolean> {
  const now = new Date("2026-08-24T16:00:00.000Z");
  const actorUserId = "91000000-0000-4000-8000-000000000001";
  const careSpaceId = "92000000-0000-4000-8000-000000000002";
  const childId = "93000000-0000-4000-8000-000000000003";
  const sessionId = "94000000-0000-4000-8000-000000000004";
  const messageId = "95000000-0000-4000-8000-000000000005";
  const turnId = "96000000-0000-4000-8000-000000000006";
  const eventOne = "97000000-0000-4000-8000-000000000007";
  const eventTwo = "97000000-0000-4000-8000-000000000008";
  const cancelEvent = "97000000-0000-4000-8000-000000000009";
  const operationId = "98000000-0000-4000-8000-000000000008";
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId,
    careSpaceId,
    childId,
    permissions: ["read", "record"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:9:a:4",
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 240_000),
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: actorUserId,
    issuedAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 600_000),
    authSessionId: "auth-session-channel-smoke",
    bearerToken: "header.payload.signature" as AuthenticatedGuardian["bearerToken"],
  });
  const commandAuth = Object.freeze({
    requestId: "request-channel-smoke",
    actorKey: "a".repeat(64),
    rateClass: "command" as const,
    profile: Object.freeze({ locale: "es-CO" as const, timeZone: "America/Bogota", versionSha256: "b".repeat(64) }),
    guardian,
  }) satisfies AuthenticatedChannelRequest;
  const streamAuth = Object.freeze({ ...commandAuth, rateClass: "stream" as const });
  let session: OwnedSessionRecord = Object.freeze({
    productSessionId: sessionId,
    eveSessionId: null,
    ownerUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    authorizationVersion: scope.authorizationVersion,
    authorizationExpiresAt: scope.expiresAt,
    status: "active",
    lastSequence: 0,
  });
  const keys = createContinuationTokenKeyRing({
    current: { kid: "channel-smoke-v1", secret: base64url.encode(new Uint8Array(32).fill(41)) },
  });
  const capabilities = Object.freeze({
    channelVersions: ["creciendo.channel.v1"],
    eventVersions: ["creciendo.channel-event.v1"],
    widgetVersions: ["growth.summary.v1"],
    ndjson: true,
  });
  const order: string[] = [];
  const createDependencies: SessionCreateRouteDependencies = {
    contextTokens: {
      verify: async () => ({
        actorUserId: scope.actorUserId,
        careSpaceId: scope.careSpaceId,
        childId: scope.childId,
        permissions: scope.permissions,
        countryOfCare: scope.countryOfCare,
        timezone: scope.timezone,
        authorizationVersion: scope.authorizationVersion,
        tokenId: "99000000-0000-4000-8000-000000000009",
        issuedAt: scope.issuedAt,
        expiresAt: scope.expiresAt,
      }),
      issue: async () => "not-used",
    } as never,
    reauthorize: async () => scope,
    sessions: {
      createOrReplay: async () => {
        order.push("create:persist");
        return { ok: true, outcome: "created", session };
      },
    },
    continuationKeys: keys,
    now: () => new Date(now),
  };
  const createResponse = await handleCreateSession(new Request("https://agent.test/creciendo/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "creciendo.channel.v1",
      childContextToken: "synthetic.child.context.token",
      locale: "es-CO",
      idempotencyKey: "channel-smoke-create",
      capabilities,
    }),
  }), commandAuth, createDependencies);
  if (createResponse.status !== 201) return false;
  const created = await createResponse.json() as Readonly<{ continuationToken?: unknown; cursor?: unknown; sessionId?: unknown }>;
  if (typeof created.continuationToken !== "string" || created.cursor !== INITIAL_EVENT_CURSOR || created.sessionId !== sessionId) return false;

  const trustedContext = createTrustedSafetyContextFromAuthorizedScope(scope, {
    chronologicalAgeDays: 400,
    locale: "es-CO",
    timezone: scope.timezone,
    referenceInstant: now,
  });
  const digest = "c".repeat(64);
  const safetyPack = compileRedFlagPack({
    verification: "synthetic_test_only",
    pack: {
      schemaVersion: "emergency-pack-v1",
      packageId: "synthetic-channel-smoke",
      jurisdiction: "CO",
      locale: "es-CO",
      version: "1.0.0",
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveUntil: null,
      algorithm: { key: "synthetic-channel-smoke", version: "1.0.0", implementationSha256: digest },
      sources: [{ id: "synthetic-source", digestSha256: digest }],
      copyKeys: ["emergency_department_es_co_v1"],
      approval: { status: "synthetic_test_only", artifactSha256: digest, approvalId: "synthetic-channel-smoke" },
      concepts: [{ id: "variant.breathing", patterns: ["respirar"] }],
      rules: [{
        code: "synthetic-breathing",
        priority: 100,
        population: { country: "CO" },
        predicate: { kind: "concept", conceptId: "variant.breathing", assertion: ["present"] },
        ambiguityPolicy: "abstain",
        decision: "urgent",
        copyKey: "emergency_department_es_co_v1",
        sourceIds: ["synthetic-source"],
      }],
    },
  });
  const messageDependencies: SessionMessageRouteDependencies = {
    sessionId,
    authorizeSession: async () => ({ scope, session, trustedContext }),
    revalidateSession: async () => session.status === "active",
    messages: {
      acceptOrReplay: async () => {
        order.push("message:persist");
        return {
          ok: true,
          outcome: "created",
          dispatchRequired: true,
          session,
          messageId,
          turnId,
          acceptedAt: now,
          cursor: INITIAL_EVENT_CURSOR,
        };
      },
    },
    preflight: new SafetyPreflight(),
    packages: { resolve: async () => safetyPack },
    eve: {
      resolve: async () => null,
      dispatch: async () => {
        order.push("message:eve");
        return { eveSessionId: "eve-channel-smoke" };
      },
    },
    bindEveSession: async () => {
      order.push("message:bind");
      session = Object.freeze({ ...session, eveSessionId: "eve-channel-smoke" });
      return session;
    },
    continuationKeys: keys,
    now: () => new Date(now),
  };
  const messageResponse = await handleSessionMessage(new Request(`https://agent.test/creciendo/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "creciendo.channel.v1",
      continuationToken: created.continuationToken,
      clientMessageId: messageId,
      idempotencyKey: "channel-smoke-message",
      parts: [{ type: "text", text: "Necesito orientación educativa general." }],
      capabilities,
    }),
  }), commandAuth, messageDependencies);
  if (messageResponse.status !== 202) return false;
  const accepted = await messageResponse.json() as Readonly<{ continuationToken?: unknown; outcome?: unknown }>;
  if (typeof accepted.continuationToken !== "string" || accepted.outcome !== "accepted") return false;

  const rows: readonly PersistedChannelEvent[] = Object.freeze([
    Object.freeze({
      eventId: eventOne,
      version: "creciendo.channel-event.v1",
      type: "text-delta",
      terminal: false,
      turnId,
      sequence: 1,
      occurredAt: "2026-08-24T16:00:01.000Z",
      cursor: eventOne,
      data: { text: "Fragmento sintético uno." },
    }),
    Object.freeze({
      eventId: eventTwo,
      version: "creciendo.channel-event.v1",
      type: "heartbeat",
      terminal: false,
      turnId,
      sequence: 2,
      occurredAt: "2026-08-24T16:00:02.000Z",
      cursor: eventTwo,
      data: { observedAt: "2026-08-24T16:00:02.000Z" },
    }),
  ]);
  session = Object.freeze({ ...session, lastSequence: 2 });
  const streamDependencies = (initialLimit: number): SessionStreamRouteDependencies => ({
    sessionId,
    continuationKeys: keys,
    now: () => new Date(now),
    pollIntervalMs: 250,
    maxDurationMs: 1_000,
    authorizeSession: async () => ({ scope, session }),
    revalidateSession: async () => ({ scope, session }),
    abortWork: async () => undefined,
    resolveCursor: async ({ cursor }) => {
      const afterSequence = cursor === INITIAL_EVENT_CURSOR ? 0 : cursor === eventOne ? 1 : cursor === eventTwo ? 2 : -1;
      return afterSequence < 0
        ? { ok: false, code: "ACCESS_DENIED" }
        : { ok: true, afterSequence, firstAvailableSequence: 1, lastSequence: 2, terminalEventId: null };
    },
    readEvents: async ({ afterSequence }) => rows.filter((event) => event.sequence > afterSequence).slice(0, initialLimit),
  });
  const streamRequest = (cursor: string) => new Request(`https://agent.test/creciendo/v1/sessions/${sessionId}/stream`, {
    headers: {
      accept: "application/x-ndjson",
      "last-event-id": cursor,
      "x-continuation-token": accepted.continuationToken as string,
      "x-creciendo-channel-version": "creciendo.channel.v1",
      "x-creciendo-event-version": "creciendo.channel-event.v1",
    },
  });
  const firstStream = await handleSessionStream(streamRequest(INITIAL_EVENT_CURSOR), streamAuth, streamDependencies(1));
  if (firstStream.status !== 200 || !firstStream.body) return false;
  const firstReader = firstStream.body.getReader();
  const firstFrame = await firstReader.read();
  await firstReader.cancel();
  if (firstFrame.done || JSON.parse(new TextDecoder().decode(firstFrame.value)).eventId !== eventOne) return false;
  order.push("stream:first");

  const resumedStream = await handleSessionStream(streamRequest(eventOne), streamAuth, streamDependencies(2));
  if (resumedStream.status !== 200 || !resumedStream.body) return false;
  const resumedReader = resumedStream.body.getReader();
  const resumedFrame = await resumedReader.read();
  await resumedReader.cancel();
  if (resumedFrame.done || JSON.parse(new TextDecoder().decode(resumedFrame.value)).eventId !== eventTwo) return false;
  order.push("stream:resume");

  const cancelDependencies: SessionCancelRouteDependencies = {
    sessionId,
    continuationKeys: keys,
    now: () => new Date(now),
    authorizeSession: async () => ({ scope, session }),
    store: {
      acceptOrReplay: async () => {
        order.push("cancel:accept");
        return {
          ok: true,
          outcome: "created",
          finalizeRequired: true,
          operationId,
          turnId,
          acceptedAt: now,
          cancellationOutcome: null,
          effectState: null,
          cursor: eventTwo,
          session,
        };
      },
      finalizeOrReplay: async () => {
        order.push("cancel:finalize");
        session = Object.freeze({ ...session, lastSequence: 3 });
        return {
          ok: true,
          outcome: "created",
          operationId,
          turnId,
          cancellationOutcome: "requested",
          effectState: "unknown",
          occurredAt: now,
          cursor: cancelEvent,
          session,
        };
      },
    },
    eve: {
      cancel: async () => {
        order.push("cancel:eve");
        return { status: "accepted" };
      },
    },
  };
  const cancelResponse = await handleCancelSession(new Request(`https://agent.test/creciendo/v1/sessions/${sessionId}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "creciendo.channel.v1",
      continuationToken: accepted.continuationToken,
      operationId,
      reason: "user_requested",
      idempotencyKey: "channel-smoke-cancel",
    }),
  }), commandAuth, cancelDependencies);
  if (cancelResponse.status !== 202) return false;
  const cancelled = await cancelResponse.json() as Readonly<{ outcome?: unknown; effectState?: unknown; cursor?: unknown }>;
  return cancelled.outcome === "requested"
    && cancelled.effectState === "unknown"
    && cancelled.cursor === cancelEvent
    && order.join(",") === "create:persist,message:persist,message:eve,message:bind,stream:first,stream:resume,cancel:accept,cancel:eve,cancel:finalize";
}

export async function runChannelStreamingEval() {
  const first = runChannelSuite();
  const second = runChannelSuite();
  if (first.digestSha256 !== second.digestSha256) throw new Error("channel_suite_determinism_mismatch");
  const cases = fixtureCases(first, await runSyntheticHttpSmoke());
  const failed = cases.filter((entry) => !entry.passed);
  const publicCases = cases.map(({ id, boundary, critical, passed }) => Object.freeze({ id, boundary, critical, passed }));
  const stable = Object.freeze({
    schemaVersion: "channel-streaming-eval.v1" as const,
    provider: "none" as const,
    fixtureSha256: sha256(readFileSync(FIXTURE, "utf8")),
    caseCount: cases.length,
    passed: cases.length - failed.length,
    failed: failed.length,
    criticalFailures: failed.length,
    isolationFailures: failed.filter((entry) => entry.boundary === "isolation").length,
    leakageFindings: failed.filter((entry) => entry.boundary === "privacy").length,
    verification: Object.freeze({
      runs: 2,
      matched: true,
      suitesPerRun: first.suites,
      testsPerRun: first.tests,
      passedTestsPerRun: first.passedTests,
      failedTestsPerRun: first.failedTests,
      digestSha256: first.digestSha256,
    }),
    cases: Object.freeze(publicCases),
  });
  return Object.freeze({ ...stable, digestSha256: sha256(canonicalize(stable)) });
}
