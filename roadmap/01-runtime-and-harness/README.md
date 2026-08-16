# Module 01 — Runtime and Harness

This module replaces the permissive Eve scaffold with the smallest production-safe runtime surface on which every later Agent Trujillo module depends.

## Entry gate

- Root roadmap documentation is complete at commit `804b2da`.
- The worktree is clean before `AT-01-01` starts.
- Node.js resolves to `24.x`.
- Eve `0.27.1` is installed and its bundled docs are readable.
- No production provider, Vercel, or Supabase mutation is required to implement this module.

## Exit gate

All seventeen leaves are completed and fresh evidence proves:

- Eve and AI SDK dependencies are exactly pinned and the installed documentation baseline is recorded;
- `agent/agent.ts` receives a direct `LanguageModel` created by `@ai-sdk/google`, using provider-native stable model ID `gemini-3.7-flash`;
- required environment values fail closed without exposing secrets;
- session limits and compaction are explicit and tested;
- permanent instructions and three runtime skills preserve the clinical product boundary;
- the scaffold developer skill is absent from runtime context;
- shell, filesystem, arbitrary network, and root delegation tools are not advertised;
- the sandbox starts every session with `networkPolicy: "deny-all"`;
- instrumentation records neither inputs nor outputs;
- `eve info --json` matches an allowlisted discovery contract with zero diagnostics;
- smoke evals prove identity, non-diagnosis, professional recommendation, urgent wording, and absence of forbidden tools.

OpenRouter, Supabase access, Creciendo authentication, clinical calculations, tools, workflows, and production deployment are not part of this module.

## Dependency graph

```text
AT-01-01 -> AT-01-02 -> AT-01-04 -> AT-01-03 -> AT-01-05 -> AT-01-06
                                                            |       |
                                                            |       +--> AT-01-07 --+
                                                            |       +--> AT-01-08 --+--> AT-01-16 -> AT-01-17
                                                            |       +--> AT-01-09 --+
                                                            |       +--> AT-01-10 --+
                                                            +----------> AT-01-15 --+
AT-01-02 -> AT-01-11 --+
         -> AT-01-12 --+--> AT-01-14 -----------------------+
         -> AT-01-13 --+
```

`AT-01-03` follows environment validation because direct-provider construction consumes the validated key. `AT-01-16` follows every discovered-surface change. `AT-01-17` is the only module completion gate.

## Approved future parallel groups

| Group | Leaves | Shared dependency | Collision rule |
|---|---|---|---|
| `runtime-skills` | `AT-01-07`, `AT-01-08`, `AT-01-09`, `AT-01-10` | `AT-01-06` | Each worker owns one skill path or the scaffold skill deletion; the root runs one combined discovery review. |
| `default-tool-lockdown` | `AT-01-11`, `AT-01-12`, `AT-01-13` | `AT-01-02` | Files are disjoint; no worker edits `agent/agent.ts`, sandbox, package files, or discovery fixtures. |

All other leaves execute sequentially. A parallel group loses parallel eligibility if implementation discovers a shared public contract or root-file edit.

## Work-unit index

| ID | Outcome | Execution | Clinical risk | Depends on |
|---|---|---|---|---|
| [AT-01-01](01-eve-version-and-docs-baseline.md) | Pin and record the Eve baseline | sequential | none | — |
| [AT-01-02](02-runtime-dependencies.md) | Pin Google provider and test dependencies | sequential | low | `AT-01-01` |
| [AT-01-03](03-gemini-direct-provider.md) | Replace Anthropic with direct Gemini | sequential | medium | `AT-01-04` |
| [AT-01-04](04-environment-schema.md) | Validate server-only runtime environment | sequential | low | `AT-01-02` |
| [AT-01-05](05-agent-limits-and-compaction.md) | Set explicit durable-session limits | sequential | low | `AT-01-03` |
| [AT-01-06](06-clinical-identity-instructions.md) | Establish always-on clinical identity | sequential | high | `AT-01-05` |
| [AT-01-07](07-runtime-clinical-safety-skill.md) | Add load-on-demand safety procedure | parallel | critical | `AT-01-06` |
| [AT-01-08](08-runtime-tool-policy-skill.md) | Add tool-use and confirmation procedure | parallel | high | `AT-01-06` |
| [AT-01-09](09-runtime-response-format-skill.md) | Add response-format procedure | parallel | high | `AT-01-06` |
| [AT-01-10](10-remove-developer-skill-from-runtime.md) | Remove Eve developer instructions from runtime | parallel | low | `AT-01-06` |
| [AT-01-11](11-disable-shell-and-filesystem-tools.md) | Remove shell and file tools | parallel | medium | `AT-01-02` |
| [AT-01-12](12-disable-arbitrary-network-tools.md) | Remove arbitrary web tools | parallel | high | `AT-01-02` |
| [AT-01-13](13-disable-runtime-delegation.md) | Remove root self-delegation | parallel | medium | `AT-01-02` |
| [AT-01-14](14-sandbox-deny-all-policy.md) | Deny sandbox network egress | sequential | high | `AT-01-11`, `AT-01-12`, `AT-01-13` |
| [AT-01-15](15-privacy-safe-instrumentation-baseline.md) | Disable prompt/output tracing | sequential | high | `AT-01-05` |
| [AT-01-16](16-eve-info-discovery-gate.md) | Enforce the compiled Eve surface | sequential | high | `AT-01-07`–`AT-01-15` |
| [AT-01-17](17-runtime-smoke-evals.md) | Prove the runtime safety baseline | sequential | critical | `AT-01-16` |

## Module verification

Run after every discovered-surface change:

```powershell
npm run typecheck
npm test -- --reporter=verbose
npx eve info --json
npm run build
```

The exit gate additionally runs `npm run verify:discovery` and `npx eve eval runtime --strict --max-concurrency 1 --json` with an authorized non-production Gemini key.

## Handoff

Completion unblocks `AT-02-01`, `AT-10-01`, `AT-11-01`, and `AT-14-01`. Those modules may extend the runtime only through typed, authenticated, child-scoped surfaces; they may not re-enable capabilities removed here.
