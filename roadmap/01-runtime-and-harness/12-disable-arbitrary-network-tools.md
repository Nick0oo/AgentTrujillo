---
id: AT-01-12
title: Disable arbitrary network tools in the root harness
module: 01-runtime-and-harness
status: pending
execution: parallel
parallel_group: default-tool-lockdown
depends_on: [AT-01-02]
blocks: [AT-01-14]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/tools/web_fetch.ts
    - agent/tools/web_search.ts
    - tests/runtime/network-tools-disabled.test.ts
  modify: []
  test:
    - tests/runtime/network-tools-disabled.test.ts
exclusive_paths:
  - agent/tools/web_fetch.ts
  - agent/tools/web_search.ts
  - tests/runtime/network-tools-disabled.test.ts
forbidden_paths:
  - .env
  - agent/agent.ts
  - agent/sandbox.ts
  - agent/connections/**
  - agent/skills/**
  - supabase/**
commit:
  message: "security(runtime): disable arbitrary network tools"
---

## Outcome

Eve's `web_fetch` and provider-managed `web_search` defaults are absent, and the runtime surface contains no authored connection that could expose `connection_search`.

## Why this exists

Unbounded web access would allow unreviewed sources, prompt injection, data exfiltration, and hidden provider-native search behavior. Clinical sources must enter through approved versioned packages or narrow trusted services.

## User and system behavior

The agent does not browse on a guardian's behalf. If an approved answer requires unavailable current guidance, it abstains or recommends a pediatrician; it never silently searches arbitrary websites.

## Prerequisites

- `AT-01-02` completed.
- Installed Eve docs confirm `web_fetch` and `web_search` slugs.
- No `agent/connections/` source exists.

## Mandatory reading

- `node_modules/eve/docs/concepts/default-harness.md`
- `node_modules/eve/docs/connections/overview.mdx`
- `node_modules/eve/docs/concepts/security-model.md`
- `docs/clinical/source-registry.md`
- `docs/adr/0002-deterministic-clinical-core.md`

## Scope

- Disable `web_fetch` and `web_search` with exact sentinel modules.
- Assert no root connection is authored and therefore conditional `connection_search` is absent.
- Reject provider-native Google Search tools/grounding in runtime model source.
- Add discovery and adversarial eval assertions.

## Out of scope

Trusted Google model API transport, narrow Supabase calls, webhooks, provider APIs in typed server code, sandbox network policy, and future approved source-ingestion workflows are not “arbitrary network tools” and have separate contracts.

## Allowed files

Only the two sentinel files and the dedicated test.

## Forbidden files and operations

Do not author a connection, URL-fetch alias, browser/search tool, Google Search provider tool, allowlist, or runtime HTTP proxy. Do not make live external calls during tests.

## Interfaces and types

Both sentinel modules use the exact two-line `disableTool()` shape. The test's forbidden surface is `web_fetch`, `web_search`, `connection_search`, any qualified connection tool, and provider-native search tool metadata.

## Technical design

Disable known defaults at discovery. Because Eve `0.27.1` creates `connection_search` dynamically only when connections exist and it is not a sentinel-disableable registered default, enforce an empty connection source/manifest until a later reviewed architecture explicitly replaces this gate.

## Database and Storage contract

No database behavior. Supabase is reached only from trusted typed code after scope resolution, never through an arbitrary model network tool.

## Authorization and isolation

No request content or child data may be sent to an arbitrary origin. Later network clients receive only minimum required scoped data and are not model-selectable endpoints.

## Clinical safety rules

The model cannot cite web search as clinical authority. Missing or stale rule packs fail safely; current Colombia/US guidance is activated only through clinically approved packages.

## Failure modes

- Sentinel slug invalid: build fails.
- Any connection appears: discovery gate fails.
- Provider search tool enabled through model options: source/compiled scan fails.
- User pastes a URL and requests fetching: model explains it cannot browse; no tool call.
- Required rule unavailable: `RULE_UNAVAILABLE`/professional recommendation, not web improvisation.

## Implementation sequence

1. Write failing sentinel, empty-connection, and provider-search tests.
2. Add the two sentinel modules.
3. Run tests, typecheck, discovery, and build.
4. Inspect compiled surface for conditional/dynamic network tools.
5. Run adversarial URL/search eval after `AT-01-17`.

## Unit and integration tests

Tests import both sentinels, assert no `agent/connections` files, scan direct Google construction for `tools.googleSearch`/grounding, and verify compiled runtime lacks all forbidden network names.

## Eve evals and adversarial cases

Cases request a current web search, fetch an injection URL, send a URL containing child data, and ask to install an MCP server. Assert `notCalledTool` for both defaults, no connection tool, and a bounded limitation response.

## Manual verification

Run the dedicated test, `npx eve info --json`, build, inspect skills/tools/connections in compiled artifacts, and later run runtime network-lockdown evals.

## Completion evidence

Record disabled slugs, empty connection set, provider-search scan, test/eval counts, commands/exit codes, and commit hash.

## Commit protocol

Stage only three declared paths, run cached/secret/artifact checks, and commit exactly `security(runtime): disable arbitrary network tools`.

## Completion checklist

- [ ] Both arbitrary web defaults are disabled.
- [ ] Connections and conditional connection search are absent.
- [ ] Provider-native search is absent.
- [ ] Missing sources fail safely.
- [ ] Tests, discovery, build, evals, and scans pass.

## Handoff

Contributes to `AT-01-14`. Later trusted integrations require dedicated tools/workflows and cannot weaken this model-facing network boundary.
