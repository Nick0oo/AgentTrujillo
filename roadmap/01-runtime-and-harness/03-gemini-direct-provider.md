---
id: AT-01-03
title: Replace the Anthropic scaffold with direct Gemini
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-04]
blocks: [AT-01-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: medium
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/lib/model/google.ts
    - tests/runtime/google-provider.test.ts
  modify:
    - agent/agent.ts
  test:
    - tests/runtime/google-provider.test.ts
exclusive_paths:
  - agent/agent.ts
  - agent/lib/model/google.ts
  - tests/runtime/google-provider.test.ts
forbidden_paths:
  - .env
  - .env.*
  - agent/channels/**
  - agent/tools/**
  - supabase/**
commit: b519ae2
  message: "feat(runtime): use Gemini through the direct Google API"
---

## Outcome

Eve receives a provider-authored Google `LanguageModel` for stable provider-native model ID `gemini-3.7-flash`; the scaffold string `anthropic/claude-sonnet-5` is absent and OpenRouter remains disabled.

## Why this exists

The approved provider path is Google's direct Gemini API through `@ai-sdk/google`, not Vercel AI Gateway and not the scaffold Anthropic model. Mixing ID formats can silently route through the wrong provider or fail at runtime.

## User and system behavior

Authorized future conversations use Gemini as their only generative provider. Missing or invalid configuration prevents startup/model construction; the system never falls back implicitly and never exposes the key in the error.

## Prerequisites

- `AT-01-04` provides `loadRuntimeConfig` and validated `googleApiKey`.
- `@ai-sdk/google@4.0.44`, `ai@7.0.35`, and Eve `0.27.1` are installed.
- Official Google model catalog checked on 2026-08-16 lists `gemini-3.7-flash` as a stable endpoint; implementation rechecks availability before pinning.

## Mandatory reading

- `node_modules/eve/docs/agent-config.md`, direct provider section
- `node_modules/ai/docs/02-foundations/02-providers-and-models.mdx`
- `node_modules/ai/docs/08-migration-guides/23-migration-guide-7-0.mdx`, Google Provider section
- `agent/lib/config/env.ts`
- `agent/agent.ts`
- [Google Gemini API model catalog](https://ai.google.dev/gemini-api/docs/models), which listed `gemini-3.7-flash` as stable and was last updated 2026-08-14 when this roadmap was authored
- [Google Gemini model deprecations](https://ai.google.dev/gemini-api/docs/deprecations)

## Scope

- Export `PRIMARY_GOOGLE_MODEL_ID` as the literal `"gemini-3.7-flash"`.
- Export `createPrimaryGoogleModel(config: RuntimeConfig): LanguageModel` using AI SDK 7 `createGoogle({ apiKey })` and `provider(PRIMARY_GOOGLE_MODEL_ID)`.
- Pass that `LanguageModel` to `defineAgent`.
- Remove every Anthropic/Gateway model reference from runtime source.
- Add structural tests for provider name/model ID and source scans for forbidden routes.

## Out of scope

No fallback, dynamic routing, web search, Google Search grounding, provider tool, image/audio model, Vertex AI, live clinical eval, model tuning, or production key configuration is included.

## Allowed files

Only `agent/agent.ts`, `agent/lib/model/google.ts`, and `tests/runtime/google-provider.test.ts`.

## Forbidden files and operations

Do not read or print `.env`, call a live model during unit tests, add a Gateway ID containing `google/`, use `gemini-*-latest`, use preview/experimental models, install another provider, or mutate Vercel/provider settings.

## Interfaces and types

```ts
export const PRIMARY_GOOGLE_MODEL_ID = "gemini-3.7-flash" as const;
export type PrimaryGoogleModelId = typeof PRIMARY_GOOGLE_MODEL_ID;
export function createPrimaryGoogleModel(config: RuntimeConfig): LanguageModel;
```

`agent/agent.ts` calls `loadRuntimeConfig(process.env)` once and passes `createPrimaryGoogleModel(config)` as `model` to `defineAgent`.

## Technical design

Instantiate a scoped provider with `createGoogle`, not the deprecated `createGoogleGenerativeAI`. Key injection is explicit, server-only, and isolated in the provider factory. The model ID is a code constant so an environment edit cannot bypass review. Do not enable provider-native web/search tools. Preserve provider-default reasoning until `AT-01-05` explicitly chooses runtime settings supported by Eve.

## Database and Storage contract

No persistence interaction. Model construction must not read child, guardian, session, database, or Storage data.

## Authorization and isolation

Provider creation occurs before request authorization but receives no clinical data. Later channel code must resolve `AuthorizedChildScope` before any message reaches the model; this unit does not weaken that gate.

## Clinical safety rules

Gemini is a language orchestrator only. It is not a diagnostic or clinical-calculation engine, cannot select authoritative country/child, and cannot replace deterministic red-flag handling. Provider failure results in an error/abstention path, not invented advice.

## Failure modes

- Missing key: environment parser returns redacted `ENV_INVALID`; model is not created.
- Unsupported/deprecated model: block release and update through a reviewed model-change task; never switch to a `latest` alias.
- Google outage/quota/timeout: no fallback in this module and no partial replay through another provider.
- Source contains Gateway or Anthropic ID: structural test fails.
- Key appears in error, snapshot, or telemetry: critical failure.

## Implementation sequence

1. Write tests expecting provider `google.generative-ai`, model ID `gemini-3.7-flash`, and no forbidden strings; observe failure against the scaffold.
2. Recheck official model status and `@ai-sdk/google` local type exports.
3. Implement the provider factory with an inert fake key in unit tests.
4. Replace `agent.ts` model configuration.
5. Run tests, typecheck, `eve info`, and build without a live call.
6. With explicit non-production key authority, run one later smoke eval under `AT-01-17`; do not do so here by default.

## Unit and integration tests

`tests/runtime/google-provider.test.ts` asserts the literal model ID, provider identifier, no evaluation-time network request, redacted missing-key failure through the config boundary, and absence of `anthropic/`, `openrouter`, `google/`, `*-latest`, `preview`, and `experimental` in runtime model source.

## Eve evals and adversarial cases

No generative eval is required in this unit. `eve info --json` must report a direct-provider identity consistent with Gemini and zero diagnostics; `AT-01-17` owns response behavior.

## Manual verification

Run `npm test -- tests/runtime/google-provider.test.ts`, `npm run typecheck`, `npx eve info --json`, `npm run build`, and source scans for forbidden provider strings. All exit `0`; no command prints the API key.

## Completion evidence

Record official model catalog URL/date, package versions, exact info model identity, test assertions/count, exit codes, secret scan, and commit hash.

## Commit protocol

Stage only the three declared paths, inspect that the only runtime provider is direct Google, run cached checks and secret scan, then commit exactly `feat(runtime): use Gemini through the direct Google API`.

## Completion checklist

- [x] Stable provider-native model ID is pinned in code; user-approved model is gemini-3.6-flash.
- [x] Direct `LanguageModel` reaches Eve.
- [x] Anthropic, Gateway, OpenRouter, latest, and preview routes are absent.
- [x] Missing configuration fails without secret disclosure.
- [x] Tests, typecheck, info, build, and scans pass.

## Handoff

Unblocks `AT-01-05`. Module `14` may add an evaluated OpenRouter route later but must retain this exact direct-Google baseline for parity comparison.
