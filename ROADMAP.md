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
- Eve `0.27.13`, Node.js `24.x`, AI SDK, Zod, and strict TypeScript installed.
- Current scaffold passes typecheck and build.

These facts do not close pending behavioral gates. Local schema parity, generated types, negative RLS testing, session ownership, idempotency gaps, vector scope hardening, and Realtime hardening remain explicit module `02` work.

## Current roadmap state

- Documentation design: `completed` at commit `08ed71a`.
- Documentation implementation plan: `completed` at commit `2ba542b`.
- Atomic roadmap authoring: modules `01` through `15` completed and cross-module verification passed; see [verification evidence](docs/verification/2026-08-16-agent-roadmap.md).
- Product implementation: modules `01` through `09` completed with fresh runtime and Cloud evidence. Module `07` exact minimal formularies were released in `54e615c`; conveyed approval is recorded without a personal signature.
- Module 08 is **17/17 completed with 0 pending leaves**. Final boundary evidence is recorded at implementation commit `145b3b0` and `docs/verification/nutrition-development.md`.
- Module 09 is **21/21 completed with 0 pending leaves**. Final isolation evidence is recorded at implementation commit `debbfcf` and `docs/verification/memory-documents.md`.
- Module 10 execution uses the root-authorized 2026-08-23 contract reconciliation: Eve `0.27.13` supersedes its historical `0.27.1` references, and only `AT-13-01` may execute early after verified `AT-03-11` to supply the provider-neutral catalog required by `AT-10-02`. The rest of Module 13 remains pending behind its general entry gate.
- Module 10 is **33/33 completed with 0 pending leaves**. `AT-10-01` closed at `13ef49f`; `AT-10-02` at `f0ce01a`; `AT-10-03` at `73ad42a`; `AT-10-04` at `296fad3`; `AT-10-05` at `114b0c6`; `AT-10-06` at `783fc32`; `AT-10-07` at `4af8b5d`; `AT-10-08` at `ae6988c`; `AT-10-09` at `71c8aeb` plus trusted/mobile compatibility correction `9271b9e`; `AT-10-10` at `9e3943f`; `AT-10-11` at `b1bce0e`; `AT-10-12` at `3c4f46d`; `AT-10-13` at `84178dd`; `AT-10-14` at `1dc2dd4`; `AT-10-15` at `9f10223`; `AT-10-16` at `c7b9cbe`; `AT-10-17` at `39fa910`; `AT-10-18` at `6e70693`; `AT-10-19` at `7ac4682`; `AT-10-20` at `75b5f4d`; `AT-10-21` at `d34b07f`; `AT-10-22` at `a2a2e19`; `AT-10-23` at `7bed230`; `AT-10-24` at `1b53e5e`; `AT-10-25` at `5c06e75`; `AT-10-26` at `311dc62`; `AT-10-27` at `1020998`; `AT-10-28` at `6a99955`; `AT-10-29` at `cb1d5c8`; `AT-10-30` at `722afa9`; `AT-10-31` at `d9fb08a`; `AT-10-32` at `6bd8663`; and `AT-10-33` at `ca418b1`, after the Eve-supported runtime-helper correction in `2ada844`, the explicit replay-fingerprint amendments `43639a7`/`acdeadc`, the safe-error/audit amendment `a01db90`, the discovery-identity correction `d5ff6e1`, and the final independent-review amendment `bc41c61`.
- The early `AT-13-01` exception is completed at `eb82958` with a provider-neutral, synthetic-test-only catalog. It unblocks `AT-10-02`; all other Module 13 leaves remain pending behind the general Module 13 entry gate.

## Module ledger

| Module | Purpose | Documentation | Product implementation | Exit gate | Index |
|---|---|---:|---:|---|---|
| 01 | Runtime and harness | completed | completed | Safe Eve surface with Gemini baseline and discovery gate | [Module 01](roadmap/01-runtime-and-harness/README.md) |
| 02 | Access and session isolation | completed | completed | Zero cross-space, cross-child, and cross-session access | [Module 02](roadmap/02-access-and-session-isolation/README.md) |
| 03 | Clinical governance | completed | completed | Only approved, versioned, checksum-matching packages resolve | [Module 03](roadmap/03-clinical-governance/README.md) |
| 04 | Safety and emergency boundary | completed | completed | Critical red flags bypass the LLM and emit approved emergency-only copy | [Module 04](roadmap/04-safety-and-emergency-boundary/README.md) |
| 05 | Anthropometry and growth | completed | completed | Reproducible age, Z-score, percentile, and growth-series results | [Module 05](roadmap/05-anthropometry-and-growth/README.md) |
| 06 | Immunization | completed | completed | PAI and ACIP evaluations are separate, reproducible, and source-traceable | [Module 06](roadmap/06-immunization/README.md) |
| 07 | Medication and adherence | completed | completed | Declared-dose validation is conservative and plans/intakes are idempotent | [Module 07](roadmap/07-medication-and-adherence/README.md) |
| 08 | Nutrition and development | completed | completed | Guidance stays educational and EAD-3 remains professional-only | [Module 08](roadmap/08-nutrition-and-development/README.md) |
| 09 | Clinical memory and documents | completed | completed | Retrieval and Storage remain private and child-scoped | [Module 09](roadmap/09-clinical-memory-and-documents/README.md) |
| 10 | Eve tools and presenters | completed | completed | Every tool is typed, scoped, policy-gated, idempotent, and safely rendered | [Module 10](roadmap/10-eve-tools-and-presenters/README.md) |
| 11 | Creciendo channel and streaming | completed | pending | Authenticated NDJSON resumes without leaks or duplicate effects | [Module 11](roadmap/11-creciendo-channel-and-streaming/README.md) |
| 12 | Persistence, workflows, and Realtime | completed | pending | Replays converge and Realtime emits invalidations only | [Module 12](roadmap/12-persistence-workflows-and-realtime/README.md) |
| 13 | Commerce and entitlements | completed | pending | Verified event ledger converges to provider-neutral entitlements | [Module 13](roadmap/13-commerce-and-entitlements/README.md) |
| 14 | Model fallback, observability, and evals | completed | pending | Fallback parity and privacy gates have zero critical failures | [Module 14](roadmap/14-model-fallback-observability-and-evals/README.md) |
| 15 | Deployment and production | completed | pending | Colombia rollout, rollback, security, clinical, and operational gates pass | [Module 15](roadmap/15-deployment-and-production/README.md) |

Modules are ordered by their load-bearing dependencies. Leaves inside a module may declare safe parallel groups after their shared contracts are complete.

## Ready queue

Module 11 is 2/18 completed. `AT-11-03` is `in_progress`; all later Module 11 leaves remain dependency-gated. No Module 12 leaf is active.

Root-authorized Module 11 reconciliation (2026-08-24): Eve 0.27.13 is binding; `/creciendo/v1` is the sole five-route public family; the linked Cloud source is `CreciendoApp` (`yapjiinrjsrothzgzxsv`) with verified head `20260823230000`; AT-11-10 owns forward migration `20260824100000`, free pgTAP ID `038`, and authoritative generated target `agent/lib/supabase/database.types.ts`; AT-11-18 modifies the existing internal channel. Only the reviewed AT-11-10 forward migration is authorized for remote application after dry-run and Cloud safety review. Conservative clinical approval for the seven marked Module 11 leaves is recorded as unsigned product-owner conveyance without clinician identity or signature attribution.

Module 11 filesystem-first composition amendment (2026-08-24): installed Eve discovers the default `agent/channels/creciendo.ts` export, not standalone `src/` route files. The sequential auth/route leaves additionally own that composition path, AT-11-15 additionally owns the existing stream route/test for revocation integration, AT-11-17 owns additive eval dispatch, and AT-11-18 owns final Creciendo/Eve channel plus Module 11 discovery fixture/verifier closure. This path amendment is required to make the five declared routes executable; it adds no route, permission, database change, remote effect, or concurrent ownership.

Root replay-receipt amendment for `AT-10-14`: the medication Cloud RPCs already return a durable `created`/`idempotent_replay` outcome, but the verified repository/application adapters discarded it. The leaf now owns only the exact additive port, plan-service, schedule-service, repository and regression-test paths required to propagate that existing receipt into `withToolIdempotency`. No database/API/schema/clinical rule changes or remote effects are authorized, and all existing record-only service methods remain compatible.

Root correction before `AT-10-09`: Eve's public tool context requires one shared fail-closed factory bridge to the branded request-scoped context, and branded safe errors must survive the idempotency wrapper. `AT-10-09` owns the explicitly added bridge/idempotency integration paths; no model authority, credential, per-user global state or new clinical behavior is authorized.

Fresh Eve `0.27.13` discovery correction for `AT-10-09`: the implementation path uses `agent/tools/get_growth_summary.ts` so filesystem-derived identity is exactly `get_growth_summary`; the earlier hyphenated path produced the non-contractual name `get-growth-summary`. Schema, policy and clinical behavior are unchanged.

Module-wide Eve discovery path correction: the same verified Eve `0.27.13` filesystem rule applies to all remaining authored Module 10 tools. Their frontmatter `touches` and `exclusive_paths` use underscore filenames matching the current user-authorized exact thirteen-tool surface; roadmap/test document filenames remain hyphenated. This is a path/ownership amendment only and changes no schema, policy, clinical behavior or dependency.

Root final-gate amendment for `AT-10-33`: the user-required `npm run eval -- tool-contracts` entry is absent and the existing discovery command still compares against the preserved Module 01 zero-tool fixture. AT-10-33 additionally owns only `package.json`, `scripts/verify-eve-discovery.mjs`, `tests/runtime/eve-discovery.test.ts`, and a new `tests/fixtures/runtime/eve-info-module-10.json` so the final commands can prove the current exact surface. The Module 01 fixture remains unchanged; no package dependency, runtime route, provider, clinical behavior or remote state is authorized.

AT-10-33 review amendment: independent Standards/Spec review rejected the first source-string eval and its constant leakage result, and identified host-clock use in the otherwise pure guardian-confirmation presenter. AT-10-33 now also owns only `src/presentation/guardian-confirmation.ts`, its focused test, and the Module 10 README exit-gate sentence. The corrected eval must derive leakage/prohibited findings from behavioral tests, captured-output scans and strict runtime data, compare two internal runs, and expose only bounded failure codes; the presenter receives an explicit trusted instant. Approval semantics, clinical wording, widget version, tool behavior and remote state remain unchanged.

Post-closure Module 11/`AT-10-21` compatibility correction for `AT-10-09`: the full Eve result must be strict trusted mobile data with bounded standard/version/reference provenance, and `toModelOutput` must separately emit the smaller `get_growth_summary.model.v1` projection. The correction changes no clinical value, calculation, authority, effect or wording and is confined to the completed leaf's owned tool/test paths.

## Active workers

- Root agent — `AT-11-03`; claimed paths: auth middleware/test and the sequential `agent/channels/creciendo.ts` composition seam.


Cloud-only execution override (2026-08-23): by explicit current user instruction, Module 09 uses the verified linked Supabase Cloud project as its only database source of truth. Local reset/test availability or drift is not an execution gate. Database leaves must verify exact project identity, migration impact, recoverability, generated linked types, and rollback-safe Cloud tests before any remote mutation.

Delegated implementation leaves use GPT-5.6 Luna with reasoning `max`. The initial Module 10 instruction required direct root execution; the user's later explicit amendment authorized subagents only for genuinely parallel leaves. `AT-10-12` and `AT-10-13` used Luna/max on disjoint paths while the root retained all review, gate, commit and evidence authority. Sequential presenters remain root-owned one at a time.

## Blockers

| Blocker | Affected units | Resolution authority | State |
|---|---|---|---|
| OpenRouter has no parity evidence | Fallback activation | Module 14 evidence and user-approved rollout | Expected future gate |
| United States production activation is not approved | Module 15 US activation | Clinical, legal, provider, and release evidence | Expected future gate |
| Cloud has no authorized clinical-memory candidate capture RPC or request-scoped adapter | `AT-09-04`, `AT-09-05`, and dependent Module 09 leaves | `AT-09-04A` forward amendment with Cloud migration/test/types/adapter evidence | Resolved by commit `17940ef` and linked Cloud evidence 2026-08-23 |
| Cloud has no authorized memory decision/revocation RPC or request-scoped adapter | `AT-09-05`, `AT-09-07`, `AT-09-10`, and dependent leaves | `AT-09-05A` forward amendment with Cloud migration/test/types/adapter/outbox evidence | Resolved by commit `d053064` and linked Cloud evidence 2026-08-23 |

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
