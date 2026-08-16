---
id: AT-01-15
title: Establish privacy-safe Eve instrumentation defaults
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-05]
blocks: [AT-01-16]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/instrumentation.ts
    - agent/lib/observability/privacy.ts
    - tests/runtime/instrumentation-privacy.test.ts
  modify: []
  test:
    - tests/runtime/instrumentation-privacy.test.ts
exclusive_paths:
  - agent/instrumentation.ts
  - agent/lib/observability/privacy.ts
  - tests/runtime/instrumentation-privacy.test.ts
forbidden_paths:
  - .env
  - agent/channels/**
  - agent/tools/**
  - agent/instructions.md
  - supabase/**
commit:
  message: "security(observability): disable sensitive trace recording"
---

## Outcome

Eve instrumentation explicitly sets `recordInputs: false` and `recordOutputs: false`, exports no external telemetry, and permits only a small opaque runtime-context vocabulary.

## Why this exists

Eve instrumentation defaults both recordings to true when enabled. Pediatric messages, tool inputs, memory, prompts, and outputs can contain sensitive data and must not enter traces by default.

## User and system behavior

No conversation content is exported. Operators may observe bounded technical status locally, but cannot reconstruct guardian messages, model responses, child identity, or reasoning from instrumentation.

## Prerequisites

- `AT-01-05` completed.
- No exporter has legal/privacy approval.
- Installed Eve instrumentation docs and AI SDK telemetry behavior are understood.

## Mandatory reading

- `node_modules/eve/docs/guides/instrumentation.md`
- `node_modules/eve/docs/concepts/security-model.md`
- `node_modules/ai/docs/03-ai-sdk-core/telemetry.mdx` or the installed telemetry page resolved by search
- `docs/clinical/safety-contract.md`, privacy evals
- `AGENTS.md`, Untrusted content and privacy

## Scope

- Create root `agent/instrumentation.ts` using `defineInstrumentation`.
- Set both content-recording flags false and stable function ID `agent-trujillo`.
- Do not define `setup` or install an exporter.
- Export an allowlist type/guard for future runtime-context keys: opaque correlation ID, provider route, step index, channel kind, tool name/status, failure class, latency/token/cost buckets, and boolean safety outcome.
- Add source and serialization tests rejecting sensitive fields.

## Out of scope

OTel exporter, Vercel Agent Runs retention changes, dashboards, alerts, raw error logging, database audit, PHI de-identification pipeline, or production telemetry approval are later module-14 work.

## Allowed files

Only the instrumentation module, privacy helper, and dedicated test.

## Forbidden files and operations

Do not install an exporter, register OTel, record `modelInput`, access messages, add names/emails/IDs/prompts/tool payloads/reasoning/documents, print environment values, or attempt to override Eve's reserved `$eve.*` tags.

## Interfaces and types

```ts
export const SAFE_RUNTIME_CONTEXT_KEYS = [
  "agent.correlation_id",
  "agent.provider_route",
  "agent.channel_kind",
  "agent.tool_name",
  "agent.tool_status",
  "agent.failure_class",
  "agent.safety_mode",
] as const;
export type SafeRuntimeContextKey = typeof SAFE_RUNTIME_CONTEXT_KEYS[number];
export function assertSafeRuntimeContext(value: Record<string, unknown>): void;
```

The initial instrumentation emits no custom event context; the helper governs later additions.

## Technical design

Presence of `instrumentation.ts` enables telemetry, so make privacy settings explicit even without setup. Tests inspect the definition/source and feed forbidden keys/values to the guard. Opaque correlation IDs must be newly generated technical IDs, never hashes of PII or raw database IDs.

## Database and Storage contract

No persistence. Database audit is a separate minimized structured record and must not be conflated with AI traces.

## Authorization and isolation

No care-space, guardian, or child identifier enters instrumentation. Observability cannot be queried to discover tenancy relationships.

## Clinical safety rules

No clinical text, emergency phrase, symptom, rule input/output, medication, growth value, or vaccine record enters spans. A future safety mode may be a bounded enum only.

## Failure modes

- Either record flag missing/true: critical test failure.
- Exporter/setup present without approval: release blocked.
- Runtime context contains a forbidden key/non-scalar/unbounded string: guard throws before export.
- Application error includes sensitive payload: module `14` redaction tests must catch; this baseline must not serialize it.
- Eve Agent Runs platform behavior exceeds approved retention: production gate blocks even though this file is safe.

## Implementation sequence

1. Write failing source/definition/privacy-guard tests.
2. Implement the safe-key constants and bounded scalar validation.
3. Add minimal `defineInstrumentation` with no setup/events.
4. Run tests, typecheck, info, and build.
5. Inspect compiled instrumentation and local traces/logs for content absence using synthetic markers.

## Unit and integration tests

Tests require both false flags; reject `setup`, `modelInput`, messages and forbidden identifier/content keys; validate only short scalar enum/number/opaque values; and search build artifacts/logs for unique synthetic input/output markers.

## Eve evals and adversarial cases

Run a smoke eval with unique fake sensitive markers, then scan permitted artifacts and logs. No marker may appear in exported trace fields; framework-local eval event artifacts are test fixtures and must remain ignored/redacted before sharing.

## Manual verification

Run the dedicated test, typecheck, info, build, one local synthetic turn when a test provider is available, and marker scans under `.eve/`. Do not attach raw `.eve` logs as evidence; record only scan counts.

## Completion evidence

Record flags, safe-key list, marker scan count zero for telemetry/export, tests/build/info exit codes, absence of exporter dependencies, and commit hash.

## Commit protocol

Stage only three declared paths, scan for PHI/secret examples and artifacts, and commit exactly `security(observability): disable sensitive trace recording`.

## Completion checklist

- [ ] Input and output recording are explicitly false.
- [ ] No exporter or setup exists.
- [ ] Safe context vocabulary excludes identity/content.
- [ ] Synthetic marker and source scans pass.
- [ ] Tests, typecheck, info, and build pass.

## Handoff

Contributes to `AT-01-16`. Module `14` may add an approved exporter only while preserving these defaults and passing privacy gates.
