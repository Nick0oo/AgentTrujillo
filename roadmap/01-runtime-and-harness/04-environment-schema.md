---
id: AT-01-04
title: Validate the server-only runtime environment
module: 01-runtime-and-harness
status: pending
execution: sequential
parallel_group: null
depends_on: [AT-01-02]
blocks: [AT-01-03]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: low
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - .env.example
    - agent/lib/config/env.ts
    - tests/runtime/env.test.ts
  modify: []
  test:
    - tests/runtime/env.test.ts
exclusive_paths:
  - .env.example
  - agent/lib/config/env.ts
  - tests/runtime/env.test.ts
forbidden_paths:
  - .env
  - .env.local
  - .env.production
  - agent/agent.ts
  - supabase/**
commit:
  message: "feat(runtime): validate server environment configuration"
---

## Outcome

Runtime configuration is parsed once through Zod into an immutable typed object; required Google configuration fails closed with stable redacted error codes, and `.env.example` documents names without values.

## Why this exists

Direct provider initialization must not scatter `process.env` reads, accept empty secrets, or leak values through Zod errors. A single boundary also prevents model-selected configuration.

## User and system behavior

Valid startup yields a frozen `RuntimeConfig`. Invalid startup stops before accepting a conversation and logs only missing/invalid field names plus `ENV_INVALID`, never raw values.

## Prerequisites

- `AT-01-02` completed with Zod `4.4.3` and Vitest available.
- Existing real environment files remain out of scope and unread.
- Canonical server key name is `GOOGLE_GENERATIVE_AI_API_KEY` for `@ai-sdk/google`.

## Mandatory reading

- `AGENTS.md`, secret and provider policies
- `node_modules/eve/docs/agent-config.md`
- `node_modules/eve/docs/concepts/security-model.md`
- `node_modules/ai/docs/08-migration-guides/23-migration-guide-7-0.mdx`
- `.gitignore`
- `tsconfig.json`

## Scope

- Define `APP_ENV` values `development`, `test`, `preview`, and `production`.
- Require nonblank `GOOGLE_GENERATIVE_AI_API_KEY` with a conservative minimum length and whitespace rejection.
- Normalize only `APP_ENV`; never trim or transform a secret silently.
- Return `Readonly<RuntimeConfig>` and freeze it.
- Define `RuntimeConfigError` with code `ENV_INVALID` and `invalidFields: readonly RuntimeConfigField[]`.
- Add a value-free `.env.example` with comments distinguishing local, preview, and production secret management.

## Out of scope

Supabase, Stripe/RevenueCat, OpenRouter, Vercel project IDs, rate limits, model ID selection, dotenv loading, remote secret creation, or environment-specific deployment configuration are owned by later leaves/modules.

## Allowed files

Only `.env.example`, `agent/lib/config/env.ts`, and `tests/runtime/env.test.ts`.

## Forbidden files and operations

Do not open, print, edit, copy, or stage any real `.env*` file. Do not call Vercel CLI, Google API, or provider endpoints. Do not accept secrets from request bodies or model inputs.

## Interfaces and types

```ts
export const runtimeConfigFieldSchema = z.enum([
  "APP_ENV",
  "GOOGLE_GENERATIVE_AI_API_KEY",
]);
export type RuntimeConfigField = z.infer<typeof runtimeConfigFieldSchema>;
export type RuntimeConfig = Readonly<{
  appEnv: "development" | "test" | "preview" | "production";
  googleApiKey: string;
}>;
export class RuntimeConfigError extends Error {
  readonly code = "ENV_INVALID";
  readonly invalidFields: readonly RuntimeConfigField[];
}
export function loadRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig;
```

## Technical design

Use a strict Zod object over a picked record rather than parsing all of `process.env`, so errors cannot serialize unrelated environment data. Convert Zod issue paths into a sorted de-duplicated field list. Override the public error message with a constant. The successful result contains the secret for server-side provider construction but supplies no `toJSON` or log helper.

## Database and Storage contract

No database or Storage changes. Future database configuration extends this boundary through a dedicated work unit and must not expose service-role credentials to model/runtime schemas.

## Authorization and isolation

Environment configuration is deployment authority, never caller authority. It contains no user, care-space, child, permission, country, plan, or entitlement fields.

## Clinical safety rules

Invalid provider configuration prevents generative operation; it must never cause the system to skip deterministic safety, fabricate advice, or silently choose another provider.

## Failure modes

- Missing, empty, whitespace-padded, or too-short key: `RuntimeConfigError` with field name only.
- Unknown `APP_ENV`: same redacted error.
- Additional process variables: ignored rather than copied into config.
- Caller mutates result: frozen object rejects/does not change.
- Error serialization reveals an input: critical test failure.

## Implementation sequence

1. Write failing tests for valid config, each invalid form, redaction, ignored variables, and immutability.
2. Implement the schema and error mapping without reading global state inside the parser.
3. Add value-free `.env.example`.
4. Scan repository diffs for key-like assignments.
5. Run narrow tests, full tests, typecheck, info, and build.

## Unit and integration tests

`tests/runtime/env.test.ts` includes at least ten cases: four environment values, default development behavior only when explicitly approved (otherwise missing fails), missing key, blank key, padded key, short key, unknown variable isolation, error redaction, sorted fields, and frozen output. Tests use obvious fake values and never inherit the developer's environment.

## Eve evals and adversarial cases

No LLM eval is appropriate. A process-start integration check supplies a fake test key and confirms `eve info`/build work without outputting it.

## Manual verification

Run `npm test -- tests/runtime/env.test.ts`, then in a child process with synthetic environment run the config loader and `npx eve info --json`. Run a secret-pattern scan over staged files. Expected errors contain `ENV_INVALID` and field names only.

## Completion evidence

Record test names/count, redaction assertion, exact commands and exit codes, staged secret-scan count zero, changed paths, and commit hash.

## Commit protocol

Stage only the three declared files. Verify `.env.example` has no assignments with values, run cached diff/secret checks, and commit exactly `feat(runtime): validate server environment configuration`.

## Completion checklist

- [ ] Only approved field names enter parsing.
- [ ] Valid output is typed and immutable.
- [ ] Invalid output is stable and redacted.
- [ ] Example environment contains no value or credential.
- [ ] Tests, typecheck, info, build, and staged scans pass.

## Handoff

Unblocks `AT-01-03`, which is the only module-01 consumer of `googleApiKey`. Later modules extend the schema without changing its redaction contract.
