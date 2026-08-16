# Agent Trujillo Execution Roadmap

This is the canonical execution ledger for Agent Trujillo. `AGENTS.md` defines how work is performed. `roadmap/README.md` defines the atomic document format. Each numbered module owns its detailed implementation work units.

## Product goal

Build a durable, child-isolated pediatric guidance backend on Eve that serves Creciendo, uses deterministic clinical engines, stores data in Supabase, uses Gemini through Google's direct API, and treats OpenRouter only as an evaluated fallback.

The agent educates and organizes. It never diagnoses, prescribes, selects medication, or replaces professional care. It recommends a pediatrician for non-urgent professional review. An urgent result only recommends going directly to the emergency department and triggers no other action.

## Verified prerequisites

The following foundation exists and is not module `00`:

- Supabase project reset to the clean pediatric schema on 2026-08-14.
- Three forward migrations applied.
- Fifty-six public product tables with RLS and `FORCE RLS` documented.
- Five private Storage buckets documented.
- pgvector enabled.
- Legacy migrations quarantined under `supabase/legacy-reference/`.
- Eve `0.27.1`, Node.js `24.x`, AI SDK, Zod, and strict TypeScript installed.
- Current scaffold passes typecheck and build.

These facts do not close pending behavioral gates. Local schema parity, generated types, negative RLS testing, session ownership, idempotency gaps, vector scope hardening, and Realtime hardening remain explicit module `02` work.

## Current roadmap state

- Documentation design: `completed` at commit `08ed71a`.
- Documentation implementation plan: `completed` at commit `2ba542b`.
- Atomic roadmap authoring: modules `01` through `13` completed; module `14` in progress on branch `codex/agent-roadmap-harness`.
- Product implementation: `pending`.
- First future executable unit after documentation verification: `AT-01-01`.

## Module ledger

| Module | Purpose | Documentation | Product implementation | Exit gate | Index |
|---|---|---:|---:|---|---|
| 01 | Runtime and harness | completed | pending | Safe Eve surface with Gemini baseline and discovery gate | [Module 01](roadmap/01-runtime-and-harness/README.md) |
| 02 | Access and session isolation | completed | pending | Zero cross-space, cross-child, and cross-session access | [Module 02](roadmap/02-access-and-session-isolation/README.md) |
| 03 | Clinical governance | completed | pending | Only approved, versioned, checksum-matching packages resolve | [Module 03](roadmap/03-clinical-governance/README.md) |
| 04 | Safety and emergency boundary | completed | pending | Critical red flags bypass the LLM and emit approved emergency-only copy | [Module 04](roadmap/04-safety-and-emergency-boundary/README.md) |
| 05 | Anthropometry and growth | completed | pending | Reproducible age, Z-score, percentile, and growth-series results | [Module 05](roadmap/05-anthropometry-and-growth/README.md) |
| 06 | Immunization | completed | pending | PAI and ACIP evaluations are separate, reproducible, and source-traceable | [Module 06](roadmap/06-immunization/README.md) |
| 07 | Medication and adherence | completed | pending | Declared-dose validation is conservative and plans/intakes are idempotent | [Module 07](roadmap/07-medication-and-adherence/README.md) |
| 08 | Nutrition and development | completed | pending | Guidance stays educational and EAD-3 remains professional-only | [Module 08](roadmap/08-nutrition-and-development/README.md) |
| 09 | Clinical memory and documents | completed | pending | Retrieval and Storage remain private and child-scoped | [Module 09](roadmap/09-clinical-memory-and-documents/README.md) |
| 10 | Eve tools and presenters | completed | pending | Every tool is typed, scoped, policy-gated, idempotent, and safely rendered | [Module 10](roadmap/10-eve-tools-and-presenters/README.md) |
| 11 | Creciendo channel and streaming | completed | pending | Authenticated NDJSON resumes without leaks or duplicate effects | [Module 11](roadmap/11-creciendo-channel-and-streaming/README.md) |
| 12 | Persistence, workflows, and Realtime | completed | pending | Replays converge and Realtime emits invalidations only | [Module 12](roadmap/12-persistence-workflows-and-realtime/README.md) |
| 13 | Commerce and entitlements | completed | pending | Verified event ledger converges to provider-neutral entitlements | [Module 13](roadmap/13-commerce-and-entitlements/README.md) |
| 14 | Model fallback, observability, and evals | in progress | pending | Fallback parity and privacy gates have zero critical failures | [Module 14](roadmap/14-model-fallback-observability-and-evals/README.md) |
| 15 | Deployment and production | pending | pending | Colombia rollout, rollback, security, clinical, and operational gates pass | [Module 15](roadmap/15-deployment-and-production/README.md) |

Modules are ordered by their load-bearing dependencies. Leaves inside a module may declare safe parallel groups after their shared contracts are complete.

## Ready queue

No product implementation unit is ready while the atomic roadmap documentation is being authored and verified.

After the documentation gate completes, the initial ready candidate is:

| ID | Work unit | Required before dispatch |
|---|---|---|
| `AT-01-01` | Eve version and documentation baseline | Documentation verification commit and clean worktree |

The root agent recalculates readiness from leaf frontmatter before every dispatch.

## Active workers

| Worker | Work unit | Claimed paths | Started | State |
|---|---|---|---|---|
| None | None | None | — | Roadmap authoring is owned by the root agent |

Future implementation workers use GPT-5.6 Luna with reasoning `max`. At most three may run concurrently after collision analysis.

## Blockers

| Blocker | Affected units | Resolution authority | State |
|---|---|---|---|
| No approved production clinical rule-pack artifacts yet | Clinical engines and activation gates | Dr. Trujillo approval plus technical checksum gate | Expected future gate |
| OpenRouter has no parity evidence | Fallback activation | Module 14 evidence and user-approved rollout | Expected future gate |
| United States production activation is not approved | Module 15 US activation | Clinical, legal, provider, and release evidence | Expected future gate |

Expected future gates are not roadmap defects. Their work units define safe `RULE_UNAVAILABLE`, disabled, or blocked behavior until evidence exists.

## Global release gates

No production release proceeds unless all applicable checks pass:

1. Typecheck and build.
2. Eve discovery contains only intended tools, skills, channels, schedules, hooks, and subagents.
3. Negative RLS, Storage, vector, and session-ownership matrices.
4. Critical red-flag and clinical-boundary evals.
5. Tool authorization, approval, and idempotency replay tests.
6. Creciendo stream, reconnect, cancellation, and revocation contract tests.
7. Gemini primary evaluation and any enabled fallback parity gate.
8. PHI/PII, reasoning, prompt, secret, and tool-payload redaction checks.
9. Workflow, webhook, projection, and Realtime convergence tests.
10. Preview smoke test, backup/restore rehearsal, rollback evidence, and controlled rollout approval.

## Evidence format

Every completed leaf records:

- implementation commit;
- exact files changed;
- verification commands and exit codes;
- test/eval counts and artifact paths;
- clinical approval evidence when required;
- accepted exceptions and residual risks;
- newly unblocked work-unit IDs.

Module completion requires all leaves completed and the module exit gate freshly verified. Documentation completion never implies product implementation completion.

## Non-negotiable boundaries

- No diagnosis or prescription.
- No model-generated clinical calculations.
- No cross-child or cross-care-space data access.
- No model-selected authority fields.
- No clinician operations or hidden case escalation.
- Urgent response means emergency-department recommendation only.
- No fallback or feature flag bypasses safety, authorization, or entitlement truth.
- No raw clinical content, prompts, reasoning, or secrets in telemetry.
- No remote mutation, deployment, push, or package activation without explicit authority.
