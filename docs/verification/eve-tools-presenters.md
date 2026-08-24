# Module 10 — Eve tools and presenters verification

Date: 2026-08-24
Branch: `codex/module-10`
Scope: `AT-10-01` through `AT-10-33`, plus the explicitly authorized early execution of `AT-13-01`.

## Result

Module 10 is implemented as thirteen model-callable Eve tools, eleven strict versioned presenters, and one exact presenter registry. The final behavioral contract eval imports the real tool descriptors, runtime policy registries, and widget registry; it locks thirty reviewed behavior suites by SHA-256 and assertion count. It reports zero critical failures, zero emitted-output leakage findings, zero prohibited-surface findings, and the stable SHA-256 digest `f6b0a0eec512a67f1ba138bb06e4567d8681cbb2e65cafbfefc0255de0632352` across its two complete internal evidence runs.

`AT-10-33` focal commit: `ca418b1d173d11187505bdc7e556472664beb152`. The subsequent documentation commit closes the roadmap state; its hash is reported in the final handoff rather than self-referenced inside that commit.

## Contract reconciliations

### Eve version

The root `AGENTS.md`, `AT-01-18`, installed `node_modules/eve/package.json`, the lockfile, and fresh `eve info` all establish Eve `0.27.13`. Historical Module 10 references to `0.27.1` were corrected explicitly by `aef1676`; no work was programmed against remembered `0.27.1` APIs. The installed Eve README and the installed tool, human-in-the-loop, schema, and discovery guidance were the framework sources used by the leaves.

### Early `AT-13-01`

The dependency cycle was resolved only for `AT-13-01`: its own dependency `AT-03-11` was verified, then `eb82958` added the provider-neutral catalog consumed by `AT-10-02`. The catalog is deterministic and synthetic-test-only; it configures no billing provider, reads no real provider account, and performs no remote mutation. Its interfaces remain compatible with the later Module 13 provider adapters. Every other Module 13 leaf remains pending behind the normal Module 13 entry gate.

### Clinical approval

The repository records conveyed approval through Module 08 without a personal signature. Module 10 leaves marked as clinically sensitive reuse the same approved source packages, rules, result semantics, and fixed copy; they do not add medications, doses, vaccine rules, nutrition rules, development criteria, diagnosis claims, or treatment claims. The emergency fixture remains `synthetic_test_only` and uses the already approved terminal emergency copy. No identity, signature, or new approval by Dr. Trujillo is asserted here.

## Atomic implementation commits and owned paths

| Leaf | Focal commit | Created or modified paths |
|---|---|---|
| AT-10-01 | `13ef49f` | `agent/lib/runtime/trusted-tool-context.ts`<br>`tests/agent/runtime/trusted-tool-context.test.ts` |
| AT-10-02 | `f0ce01a` | `agent/lib/runtime/tool-permission-policy.ts`<br>`tests/agent/runtime/tool-permission-policy.test.ts` |
| AT-10-03 | `73ad42a` | `agent/lib/runtime/tool-approval-policy.ts`<br>`tests/agent/runtime/tool-approval-policy.test.ts` |
| AT-10-04 | `296fad3` | `agent/lib/runtime/tool-approval-policy.ts`<br>`agent/lib/runtime/tool-idempotency.ts`<br>`tests/agent/runtime/tool-approval-policy.test.ts`<br>`tests/agent/runtime/tool-idempotency.test.ts` |
| AT-10-05 | `114b0c6` | `agent/lib/runtime/tool-audit.ts`<br>`tests/agent/runtime/tool-audit.test.ts` |
| AT-10-06 | `783fc32` | `agent/lib/runtime/safe-tool-errors.ts`<br>`agent/lib/runtime/tool-audit.ts`<br>`tests/agent/runtime/safe-tool-errors.test.ts`<br>`tests/agent/runtime/tool-audit.test.ts` |
| AT-10-07 | `4af8b5d` | `agent/lib/runtime/safe-to-model.ts`<br>`tests/agent/runtime/safe-to-model.test.ts` |
| AT-10-08 | `ae6988c` | `agent/tools/evaluate_vaccination_schedule.ts`<br>`tests/agent/tools/evaluate-vaccination-schedule.test.ts` |
| AT-10-09 | `71c8aeb` | `agent/lib/runtime/eve-tool-context.ts`<br>`agent/lib/runtime/tool-idempotency.ts`<br>`agent/tools/get_growth_summary.ts`<br>`tests/agent/runtime/eve-tool-context.test.ts`<br>`tests/agent/runtime/tool-idempotency.test.ts`<br>`tests/agent/tools/get-growth-summary.test.ts` |
| AT-10-10 | `9e3943f` | `agent/tools/suggest_pediatric_nutrition.ts`<br>`tests/agent/tools/suggest-pediatric-nutrition.test.ts` |
| AT-10-11 | `b1bce0e` | `agent/tools/validate_declared_pediatric_dose.ts`<br>`tests/agent/tools/validate-declared-pediatric-dose.test.ts` |
| AT-10-12 | `3c4f46d` | `agent/tools/register_anthropometry.ts`<br>`tests/agent/tools/register-anthropometry.test.ts` |
| AT-10-13 | `84178dd` | `agent/tools/record_vaccine_administration.ts`<br>`tests/agent/tools/record-vaccine-administration.test.ts` |
| AT-10-14 | `1dc2dd4` | `agent/tools/create_medication_plan.ts`<br>`src/application/medication/medication-plan-service.ts`<br>`src/application/medication/medication-schedule-service.ts`<br>`src/application/medication/ports.ts`<br>`src/persistence/supabase/medication-repository.ts`<br>`tests/agent/tools/create-medication-plan.test.ts`<br>`tests/application/medication-services.test.ts`<br>`tests/persistence/medication-repository.test.ts` |
| AT-10-15 | `9f10223` | `agent/tools/record_medication_intake.ts`<br>`src/application/medication/medication-intake-service.ts`<br>`tests/agent/tools/record-medication-intake.test.ts`<br>`tests/application/medication-services.test.ts` |
| AT-10-16 | `c7b9cbe` | `agent/tools/record_development_observation.ts`<br>`tests/agent/tools/record-development-observation.test.ts` |
| AT-10-17 | `39fa910` | `agent/tools/capture_clinical_memory_candidate.ts`<br>`tests/agent/tools/capture-clinical-memory-candidate.test.ts` |
| AT-10-18 | `6e70693` | `agent/tools/search_child_clinical_memory.ts`<br>`tests/agent/tools/search-child-clinical-memory.test.ts` |
| AT-10-19 | `7ac4682` | `agent/tools/prepare_private_document_upload.ts`<br>`tests/agent/tools/prepare-private-document-upload.test.ts` |
| AT-10-20 | `75b5f4d` | `agent/tools/generate_vaccination_card.ts`<br>`tests/agent/tools/generate-vaccination-card.test.ts` |
| AT-10-21 | `d34b07f` | `src/presentation/growth-summary.ts`<br>`tests/presentation/growth-summary.test.ts` |
| AT-10-22 | `a2a2e19` | `src/presentation/vaccination-status.ts`<br>`tests/presentation/vaccination-status.test.ts` |
| AT-10-23 | `7bed230` | `src/presentation/medication-schedule-preview.ts`<br>`tests/presentation/medication-schedule-preview.test.ts` |
| AT-10-24 | `1b53e5e` | `src/presentation/development-observation.ts`<br>`tests/presentation/development-observation.test.ts` |
| AT-10-25 | `5c06e75` | `src/presentation/nutrition-guidance.ts`<br>`tests/presentation/nutrition-guidance.test.ts` |
| AT-10-26 | `311dc62` | `src/presentation/guardian-confirmation.ts`<br>`tests/presentation/guardian-confirmation.test.ts` |
| AT-10-27 | `1020998` | `src/presentation/professional-recommendation.ts`<br>`tests/presentation/professional-recommendation.test.ts` |
| AT-10-28 | `6a99955` | `src/presentation/emergency-recommendation.ts`<br>`tests/presentation/emergency-recommendation.test.ts` |
| AT-10-29 | `cb1d5c8` | `src/presentation/source-list.ts`<br>`tests/presentation/source-list.test.ts` |
| AT-10-30 | `722afa9` | `src/presentation/dose-validation.ts`<br>`tests/presentation/dose-validation.test.ts` |
| AT-10-31 | `d9fb08a` | `src/presentation/tool-state.ts`<br>`tests/presentation/tool-state.test.ts` |
| AT-10-32 | `6bd8663` | `src/presentation/widget-registry.ts`<br>`tests/presentation/widget-registry.test.ts` |
| AT-10-33 | `ca418b1` | `package.json`<br>`scripts/verify-eve-discovery.mjs`<br>`src/presentation/guardian-confirmation.ts`<br>`tests/presentation/guardian-confirmation.test.ts`<br>`tests/runtime/eve-discovery.test.ts`<br>`tests/fixtures/runtime/eve-info-module-10.json`<br>`tests/evals/tool-contracts.eval.ts`<br>`docs/verification/eve-tools-presenters.md` |

Load-bearing amendments and compatibility corrections were kept explicit: `aef1676` (Eve/dependency reconciliation), `2ada844` (Eve-supported runtime-helper ownership), `43639a7` and `acdeadc` (stable approval evidence for replay), `a01db90` (safe-error/audit ownership), `d5ff6e1` (filesystem discovery identity), `9271b9e` (strict trusted growth result separated from the model projection), `6a65369` (AT-10-33 final-gate ownership), and `bc41c61` (independent-review corrections). `03f187d` records the AT-10-33 claim. The early catalog is `eb82958`.

## Exact Eve tool surface

Fresh `eve info` used installed Eve `0.27.13` and returned compile `ready`, 0 errors, 0 warnings, 13 tools, 3 skills, 0 subagents, and 0 schedules. Fresh discovery returned provider `google.generative-ai`, model `gemini-3.6-flash`, and exactly these model-callable tools:

1. `capture_clinical_memory_candidate`
2. `create_medication_plan`
3. `evaluate_vaccination_schedule`
4. `generate_vaccination_card`
5. `get_growth_summary`
6. `prepare_private_document_upload`
7. `record_development_observation`
8. `record_medication_intake`
9. `record_vaccine_administration`
10. `register_anthropometry`
11. `search_child_clinical_memory`
12. `suggest_pediatric_nutrition`
13. `validate_declared_pediatric_dose`

`evaluate_red_flags` remains synchronous and pre-LLM. Discovery and the final eval prove that no red-flag tool, shell, filesystem, arbitrary-network, delegation, or clinician-operation tool is active. The Module 01 `bash`, filesystem, web, and `agent` files remain `disableTool()` sentinels.

## Tool contract matrix

All tool inputs are strict and omit child, care-space, guardian, country, permission, role, and entitlement authority. Those values come from the immutable request-scoped trusted context. All tools emit a separately versioned explicit safe-to-model projection.

| Tool | Input schema / safe output | Permission / entitlement | Effect / approval / idempotency | Domain gate / presenter |
|---|---|---|---|---|
| `evaluate_vaccination_schedule` | `evaluate-vaccination-schedule.v1` / `evaluate_vaccination_schedule.model.v1` | `read` / `advanced_ai` | read-only / none / request fingerprint | immunization package / vaccination status |
| `get_growth_summary` | `get-growth-summary.v1` / `get_growth_summary.model.v1` | `read` / `advanced_ai` | read-only / none / request fingerprint | growth standard / growth summary |
| `suggest_pediatric_nutrition` | `suggest-pediatric-nutrition.v1` / `suggest_pediatric_nutrition.model.v1` | `read` / `advanced_ai` | read-only / none / request fingerprint | nutrition policy / nutrition guidance |
| `validate_declared_pediatric_dose` | `validate-declared-pediatric-dose.v1` / `validate_declared_pediatric_dose.model.v1` | `manage_medication` / `advanced_ai` | read-only / none / request fingerprint | medication reference / dose validation |
| `register_anthropometry` | `register-anthropometry.v1` / `register_anthropometry.model.v1` | `record` / `advanced_ai` | mutation / explicit UI / required | anthropometry capture / growth summary |
| `record_vaccine_administration` | `record-vaccine-administration.v1` / `record_vaccine_administration.model.v1` | `record` / `advanced_ai` | mutation / explicit UI / required | confirmed vaccine evidence / vaccination status |
| `create_medication_plan` | `create-medication-plan.v1` / `create_medication_plan.model.v1` | `manage_medication` / `advanced_ai` | mutation / explicit UI / required | medication resolution / medication schedule preview |
| `record_medication_intake` | `record-medication-intake.v1` / `record_medication_intake.model.v1` | `manage_medication` / `advanced_ai` | mutation / explicit UI / required | medication plan / tool state |
| `record_development_observation` | `record-development-observation.v1` / `record_development_observation.model.v1` | `record` / `advanced_ai` | mutation / explicit UI / required | caregiver observation / development observation preview |
| `capture_clinical_memory_candidate` | `capture-clinical-memory-candidate.v1` / `capture_clinical_memory_candidate.model.v1` | `record` / `advanced_ai` | draft / explicit UI / required | memory candidate policy / guardian confirmation |
| `search_child_clinical_memory` | `search-child-clinical-memory.v1` / `search_child_clinical_memory.model.v1` | `read` / `advanced_ai` | read-only / none / request fingerprint | confirmed child-scoped memory / source list |
| `prepare_private_document_upload` | `prepare-private-document-upload.v1` / `prepare_private_document_upload.model.v1` | `manage_documents` / `advanced_ai` | draft / explicit UI / required | private document policy / tool state |
| `generate_vaccination_card` | `generate-vaccination-card.v1` / `generate_vaccination_card.model.v1` | `manage_documents` / `reports` | mutation / explicit UI / required | confirmed immunization snapshot / tool state |

## Presenter and mobile-event matrix

All registry entries parse strict imported Zod schemas, reject additional fields and non-plain/unsafe object graphs, enforce exact byte limits, deep-freeze trusted payloads, provide bounded accessible text fallback, and use `modelPolicy: exclude_payload`.

| Kind | Version | Event / actions | Max bytes |
|---|---|---|---:|
| `growth_summary` | `growth.summary.v1` | widget / none | 262144 |
| `vaccination_status` | `vaccination.status.v1` | widget / none | 262144 |
| `medication_schedule_preview` | `medication.schedule-preview.v1` | widget / confirmation only | 262144 |
| `development_observation_preview` | `development.observation-preview.v1` | widget / confirmation only | 65536 |
| `nutrition_guidance` | `nutrition.guidance.v1` | widget / none | 262144 |
| `guardian_confirmation` | `guardian.confirmation.v1` | widget / confirmation only | 65536 |
| `professional_recommendation` | `professional.recommendation.v1` | safe text / none | 4096 |
| `emergency_recommendation` | `emergency.recommendation.v1` | terminal safety / none | 2048 |
| `source_list` | `sources.list.v1` | widget / none | 131072 |
| `dose_validation` | `medication.dose-validation.v1` | widget / none | 65536 |
| `tool_state` | `tool.state.v1` | widget / none | 16384 |

Professional recommendation is text-only and cannot contact, notify, book, transfer, hand off, or claim clinician review. Emergency recommendation is terminal and contains only the approved instruction to go directly to the emergency department; it has no diagnosis, treatment, button, phone, map, alarm, notification, workflow, handoff, or later generative text.

## Authorization, approval, replay, cancellation, and privacy

The verified order is: pre-LLM emergency gate, trusted context, authorization/permission/entitlement, strict input validation, approval for consequential effects, idempotency/audit, domain service, explicit safe error or safe projection, then trusted versioned widget event. Access is reauthorized before replay lookup; approval is validated before an effect; approval evidence is short-lived, action/effect/schema/locale-bound, digest-bound, and one-use. Revoked, expired, sibling, foreign-space, forged-authority, stale-session, replay-conflict, cancellation, and persistence-failure cases fail closed. Cancellation is best effort without claiming rollback of an already committed effect.

Audit and error records contain bounded opaque correlation data only. Tests and evals reject model authority, raw trusted payloads, prompts, reasoning, document contents, signed upload tickets/URLs, child identifiers, credentials, stack traces, diagnosis/prescription text, clinician operations, and emergency extras. Trusted mobile payloads and `*.model.v1` outputs remain separate.

Independent review found and corrected one determinism defect before closure: `guardian.confirmation.v1` previously consulted the host clock while rendering. It now requires a strict explicit trusted instant, and a regression test proves identical output despite a ten-year host-clock change. Approval expiry semantics and the five-minute bound are unchanged. The two final Luna-Max reviews found no remaining P0-P3 standards or specification issue in the implementation: they verified that the eval no longer derives coverage from test titles or source substrings, and instead consumes the actual runtime registries/descriptors plus the digest-locked behavior suites. Their only final observation was to replace the then-stale evidence counts, completed in this record.

## Fresh verification

Configuration was loaded from the principal checkout only into child-process environments; values were never copied, printed, committed, or modified. Its schema initially identified only the missing names `APP_ENV`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`; authorized synthetic test overrides supplied those fields for compile/discovery. No provider request or clinical remote effect was made.

| Command or check | Exit | Evidence |
|---|---:|---|
| Initial `npm run eval -- tool-contracts` | 1 | Expected red: package script absent. |
| Initial `npm run verify:discovery` | 1 | Expected red: preserved Module 01 fixture expected zero tools while Eve found 13. |
| Focused discovery tests after test-first change | 1 | Expected red: 4 failed, 4 passed before implementation. |
| `npm test -- tests/runtime/eve-discovery.test.ts` | 0 | 1 file, 8/8 tests passed. |
| Guardian deterministic-clock regression RED | 1 | Expected red: 1 failed, 17 passed because the presenter still consulted `Date.now()`. |
| `npm test -- tests/presentation/guardian-confirmation.test.ts` | 0 | 1 file, 18/18 tests passed. |
| `npm test -- tests/agent tests/presentation` | 0 | 33 files; 485/485 tests passed after the reviewer correction. |
| Concurrent first attempt: `npm test -- tests/access tests/safety tests/clinical tests/application tests/persistence` | 1 | 106 files passed and one red-flag latency test failed only because its maximum sample reached 96.42 ms while a second Vitest process competed for CPU; p99 was 1.88 ms and 972 tests passed. This run was not accepted as the gate. |
| `npm test -- tests/safety/red-flag-engine.test.ts` | 0 | Isolated diagnosis passed 3/3, confirming no deterministic-engine regression. |
| Fresh non-concurrent `npm test -- tests/access tests/safety tests/clinical tests/application tests/persistence` | 0 | 107 files; 973 passed, 1 intentionally skipped local-Docker parity test, 974 total. |
| First behavioral-eval correction run | 1 | Expected review RED: all 547 behavioral tests passed, but the derived gate exposed one title-coverage mismatch and two hostile-fixture strings present only in test metadata. |
| Final `npm run eval -- tool-contracts` | 0 | `tool-contract-eval.v2`; two internal evidence runs each executed 47 files/547 tests; 242 runtime-derived and digest-locked behavioral checks; actual 13 tool descriptors, permission/approval/safe-projection registries, actual 11-entry widget registry, 30 SHA-locked suites, and exact policy order; 0 critical failures, 0 emitted-output leakage, 0 prohibited surface; deterministic digest `f6b0a0eec512a67f1ba138bb06e4567d8681cbb2e65cafbfefc0255de0632352`. |
| `npm run typecheck` | 0 | Strict TypeScript passed. |
| Initial unconfigured `npm run build` | 1 | Expected configuration denial: `ENV_INVALID`; it was not accepted as the gate. |
| Final configured `npm run build` | 0 | Exact npm script passed with the principal environment loaded only into the process and authorized local test overrides. |
| `npx eve info` / installed Eve CLI | 0 | Eve `0.27.13`; compile ready; 0 errors/warnings; 13 tools; 0 subagents/schedules. |
| `npm run verify:discovery` | 0 | Exact 13-tool allowlist; Google direct provider; no forbidden tool. |
| Supabase `projects list` with principal environment | 0 | Four visible projects; exactly one linked; statuses include linked healthy state. |
| Supabase linked migration list | 0 | 50 local/remote pairs in parity through `20260823230000`. |
| Supabase linked database lint at error level | 0 | Zero error lines. |
| `git fetch origin` and ancestry check | 0 | `origin/main` at `7f8f71c`, ancestor of the branch; branch 91 commits ahead and 0 behind after the focal commit and before the closure commit. |
| Final root review, two independent Luna-Max reviews, staged diff/secret/PHI/artifact/forbidden-path scans | 0 | No remaining P0-P3 finding; exactly eight AT-10-33 focal paths staged; `git diff --cached --check` clean; zero forbidden paths and zero high-confidence credential, key, bearer, JWT, signed-URL, email, authority-field, raw-prompt/reasoning/payload/document findings. |

The one skipped test is `local Supabase parity gate runs the full local command when Docker is explicitly enabled`. It is deliberately conditional and does not weaken this no-database-change module; the linked Cloud project is the source of truth for this execution.

## Supabase Cloud state

Fresh authenticated read-only checks using the principal environment found exactly one linked project in `ACTIVE_HEALTHY` state, 50 migration pairs in parity through `20260823230000`, and linked database lint with exit 0 and no error lines. The same-day Module 09 evidence records 156/156 Cloud assertions and linked generated types of 176071 bytes with SHA-256 `7d92b41901afedbd42d9f1f4b30221b34e9ce38dec45a4164dcbedb0e9c24160`.

All 33 Module 10 leaves declare `database_change: false`. This branch adds no migration, schema change, seed, generic database write, production clinical fixture, or remote side effect. Tools use previously verified typed request-scoped services/repositories only.

## Compatibility and newly unlocked work

Module 11 can consume exact versioned trusted envelopes, fallback text, confirmation-only actions, terminal emergency events, cancellation/replay states, and model-excluded payloads without inferring authority. Private upload tickets remain trusted-event-only, and vaccination-card generation exposes bounded state rather than raw documents or URLs. Module 12 can preserve the same idempotency receipts, reauthorization-before-replay rule, private invalidations, resume/cancel semantics, and no-duplicate-effect boundary.

Completion of `AT-10-33` satisfies the remaining Module 10 dependency for `AT-11-01`; because `AT-02-16` is already complete, `AT-11-01` is newly unblocked for the later Module 11 entry/selection review but remains unclaimed and `pending` here. `AT-11-02` remains sequentially dependent on `AT-11-01`. The completed `AT-10-32` registry satisfies Module 10's side of `AT-11-11`, which remains pending on `AT-11-10`. Module 12 remains pending until both Modules 10 and 11 are complete.

## Exceptions and residual risk

- No push, merge, pull request, deployment, package activation, provider configuration, production seed, or remote mutation was performed.
- The local-Docker parity test remains intentionally skipped unless Docker execution is explicitly enabled; fresh linked Cloud status, migration parity, and lint were verified instead.
- Production upload signing and downstream mobile/channel execution remain owned by their later modules; Module 10 returns safe recoverable states where an external provider is unavailable.
- Clinical approval evidence is conveyed and unsigned; this module neither fabricates a signature nor expands the approved clinical behavior.
- Module 11 leaf prose still contains historical Eve `0.27.1` references. Root source precedence and the installed package establish `0.27.13`; that later module must reconcile its own references explicitly before implementation.
