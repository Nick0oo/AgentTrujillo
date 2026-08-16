# Agent Trujillo Roadmap Harness Design

**Date:** 2026-08-15

**Status:** Approved design

**Scope:** Documentation and execution architecture for the pending Agent Trujillo implementation. The already-deployed Supabase foundation is a verified prerequisite, not roadmap module `00`.

## 1. Purpose

Agent Trujillo needs an execution system that lets a root coding agent coordinate GPT-5.6 Luna workers without losing architectural, clinical, security, or operational constraints. The system must be understandable from the repository alone and must make every implementable unit independently assignable, reviewable, testable, and committable.

The design uses three layers:

1. `AGENTS.md` defines the immutable operating rules for every worker.
2. `ROADMAP.md` is the canonical execution index and current-state ledger.
3. `roadmap/<module>/<work-unit>.md` describes one atomic deliverable in complete implementation detail.

The roadmap begins at module `01`. Existing Supabase work is referenced as a prerequisite and verified when a task depends on it, but it is never presented as unimplemented work.

## 2. Selected decomposition

The selected approach is an atomic dependency graph organized into numbered modules.

A work unit is the smallest change that:

- has one coherent outcome;
- has its own test and review gate;
- can be accepted or rejected independently;
- owns an explicit set of paths;
- produces one meaningful commit;
- unblocks a known set of later work units.

A work unit is not necessarily one source file. One clinical engine can require several focused source and test files. Conversely, unrelated engines never share a roadmap document merely because they live in the same directory.

The following surfaces always receive dedicated work-unit documents:

- every Eve tool;
- every deterministic clinical engine;
- every public or custom channel route;
- every mobile stream adapter concern;
- every database hardening migration;
- every provider adapter and failover policy;
- every durable workflow and schedule;
- every webhook ingress;
- every Generative UI presenter;
- every system-wide eval or release gate;
- every production runbook with distinct operational ownership.

## 3. Repository layout

```text
agent-trujillo/
├── AGENTS.md
├── ROADMAP.md
├── roadmap/
│   ├── README.md
│   ├── _templates/
│   │   ├── task.md
│   │   ├── clinical-engine.md
│   │   ├── tool.md
│   │   ├── database-change.md
│   │   ├── workflow.md
│   │   └── release-gate.md
│   ├── 01-runtime-and-harness/
│   ├── 02-access-and-session-isolation/
│   ├── 03-clinical-governance/
│   ├── 04-safety-and-emergency-boundary/
│   ├── 05-anthropometry-and-growth/
│   ├── 06-immunization/
│   ├── 07-medication-and-adherence/
│   ├── 08-nutrition-and-development/
│   ├── 09-clinical-memory-and-documents/
│   ├── 10-eve-tools-and-presenters/
│   ├── 11-creciendo-channel-and-streaming/
│   ├── 12-persistence-workflows-and-realtime/
│   ├── 13-commerce-and-entitlements/
│   ├── 14-model-fallback-observability-and-evals/
│   └── 15-deployment-and-production/
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

Every numbered module contains a `README.md` plus ordered leaf documents. A module README defines its goal, entry gate, exit gate, dependency graph, parallel groups, and leaf index. It does not repeat implementation details from leaf documents.

## 4. Root document responsibilities

### 4.1 `AGENTS.md`

`AGENTS.md` is the harness contract. Every root agent and worker must read it before selecting or executing work.

It defines:

- the source-of-truth reading order;
- the required model (`gpt-5.6-luna`) and reasoning level (`max`) for implementation workers;
- the root agent's review responsibilities;
- status transitions;
- dependency and concurrency rules;
- path ownership and collision prevention;
- clinical safety invariants;
- Supabase and destructive-operation rules;
- required Eve versioned-documentation checks;
- test, evidence, commit, and handoff protocols;
- secret, PHI, PII, logging, and telemetry restrictions;
- behavior when a roadmap document conflicts with code, schema, installed docs, or another roadmap document.

If a conflict exists, work stops at the affected unit. The root agent resolves and documents the conflict before implementation continues. A worker may not silently choose one source.

### 4.2 `ROADMAP.md`

`ROADMAP.md` is the execution ledger. It contains:

- the global goal and non-negotiable product boundaries;
- verified prerequisites;
- the fifteen-module ordered index;
- module status and exit-gate state;
- the next eligible work units;
- currently active workers and their owned paths;
- blocked units and explicit blocker identifiers;
- links to module READMEs and leaf documents;
- the latest verified commit for each completed module.

Detailed implementation text never lives only in `ROADMAP.md`. It links to the atomic document that owns the requirement.

### 4.3 `roadmap/README.md`

This file explains how humans and agents use the roadmap system. It defines frontmatter fields, status transitions, concurrency selection, evidence requirements, and the completion-report format.

## 5. Work-unit metadata contract

Every leaf document starts with YAML frontmatter using this shape:

```yaml
---
id: AT-05-06
title: Implement register_anthropometry
module: 05-anthropometry-and-growth
status: pending
execution: sequential
parallel_group: null
depends_on:
  - AT-05-01
  - AT-05-02
  - AT-05-04
blocks:
  - AT-05-07
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/tools/register_anthropometry.ts
  modify: []
  test:
    - tests/tools/register-anthropometry.test.ts
exclusive_paths:
  - agent/tools/register_anthropometry.ts
  - src/clinical/anthropometry/**
  - tests/clinical/anthropometry/**
forbidden_paths:
  - supabase/legacy-reference/**
  - .env
commit:
  message: "feat(anthropometry): add confirmed measurement tool"
---
```

### 5.1 Required metadata rules

- `id` is immutable and unique.
- `status` is one of `pending`, `ready`, `in_progress`, `review`, `blocked`, or `completed`.
- `execution` is `sequential` or `parallel`.
- `parallel_group` is required when `execution` is `parallel`.
- every dependency references an existing work-unit ID.
- `exclusive_paths` must be specific enough to detect worker collisions.
- `.env`, secrets, legacy-reference SQL, and unrelated modules are forbidden unless the work unit explicitly owns them.
- `database_change: true` requires the database-change template and a reversible forward migration.
- `clinical_risk: high` requires deterministic fixtures and the clinical gate stated in the leaf document.
- `requires_clinical_approval: true` prevents production activation even after code completion until an approved artifact hash exists.

## 6. Work-unit document contract

Every leaf document contains these sections in this order:

1. **Outcome** — one observable result.
2. **Why this exists** — architectural or product rationale.
3. **User and system behavior** — externally visible behavior.
4. **Prerequisites** — exact dependency IDs and required verified state.
5. **Mandatory reading** — installed Eve pages, repository contracts, ADRs, clinical sources, and relevant schema.
6. **Scope** — complete included behavior.
7. **Out of scope** — explicit exclusions.
8. **Allowed files** — exact create/modify/test paths.
9. **Forbidden files and operations** — collision and safety boundaries.
10. **Interfaces and types** — exact names, signatures, discriminated unions, and ownership rules.
11. **Technical design** — libraries, APIs, algorithms, persistence, and data flow.
12. **Database and Storage contract** — tables, columns, constraints, RLS, RPCs, buckets, and service-role boundaries.
13. **Authorization and isolation** — actor, care space, child, permissions, and revocation behavior.
14. **Clinical safety rules** — applicable invariants and abstention behavior.
15. **Failure modes** — classified failures and safe outputs.
16. **Implementation sequence** — test-first actions small enough for reliable execution.
17. **Unit and integration tests** — named cases and expected assertions.
18. **Eve evals and adversarial cases** — model-facing and end-to-end gates.
19. **Manual verification** — commands, routes, or artifacts to inspect.
20. **Completion evidence** — exact files, logs, test summaries, and generated artifacts.
21. **Commit protocol** — staging boundaries and required commit message.
22. **Completion checklist** — binary acceptance criteria.
23. **Handoff** — newly unblocked work units and known residual risks.

The document cannot contain `TBD`, `TODO`, “implement appropriately,” “handle edge cases,” or references such as “same as the previous task.” Required behavior must be repeated where a worker needs it.

## 7. Execution protocol

### 7.1 Selection

The root agent selects only units whose dependencies are `completed` and whose entry gate is satisfied. It changes them from `pending` to `ready`, then assigns a worker and records owned paths before setting `in_progress`.

### 7.2 Worker model

Implementation workers use:

```yaml
model: gpt-5.6-luna
reasoning: max
```

The root agent retains responsibility for integration, clinical-boundary review, security review, full verification, commits, and roadmap status changes.

### 7.3 Sequential execution

A sequential unit runs alone when it:

- defines an interface consumed by later units;
- changes shared configuration;
- changes a database schema or RLS policy;
- establishes a clinical algorithm or rule-pack contract;
- changes the custom channel or stream schema;
- changes model routing, authorization, or release gates;
- owns paths shared by otherwise independent tasks.

### 7.4 Parallel execution

Parallel execution is allowed only when all of the following are true:

- units share the same non-null `parallel_group`;
- all dependencies are complete;
- `exclusive_paths` do not overlap;
- neither unit changes a shared public interface used by the other;
- neither unit changes migration order, package dependencies, root configuration, or the same generated contract;
- the module README explicitly lists the group as safe to parallelize.

The root agent may run at most three Luna workers concurrently. One worker owns one leaf document. A worker may not expand scope to another leaf document.

### 7.5 Review and integration

For each worker result, the root agent:

1. reads the worker report;
2. inspects the actual diff;
3. checks allowed and forbidden paths;
4. compares interfaces against dependencies and consumers;
5. runs the leaf verification commands;
6. runs the affected module gate;
7. scans staged content for secrets and unintended artifacts;
8. creates the specified commit;
9. records evidence and the commit hash;
10. changes the leaf status to `completed` only after fresh verification.

Worker claims never count as verification evidence.

## 8. Status state machine

```text
pending -> ready -> in_progress -> review -> completed
                         |            |
                         v            v
                       blocked <------+
```

- `pending`: dependencies or entry gate are incomplete.
- `ready`: selectable without unresolved prerequisites.
- `in_progress`: assigned to exactly one worker.
- `review`: implementation returned and awaits root verification.
- `blocked`: a named external, clinical, schema, or dependency blocker prevents completion.
- `completed`: verification passed, evidence is recorded, and a commit exists.

A failed review returns to `in_progress` with an explicit correction note. A completed unit is never edited silently; follow-up work gets a new ID or a documented amendment task.

## 9. Module map and leaf manifest

The leaf names below define the expected decomposition. During roadmap authoring, a leaf may be split further when it contains two independently reviewable outcomes, but unrelated leaves may not be merged.

### 01 — Runtime and harness

- `01-eve-version-and-docs-baseline.md`
- `02-runtime-dependencies.md`
- `03-gemini-direct-provider.md`
- `04-environment-schema.md`
- `05-agent-limits-and-compaction.md`
- `06-clinical-identity-instructions.md`
- `07-runtime-clinical-safety-skill.md`
- `08-runtime-tool-policy-skill.md`
- `09-runtime-response-format-skill.md`
- `10-remove-developer-skill-from-runtime.md`
- `11-disable-shell-and-filesystem-tools.md`
- `12-disable-arbitrary-network-tools.md`
- `13-disable-runtime-delegation.md`
- `14-sandbox-deny-all-policy.md`
- `15-privacy-safe-instrumentation-baseline.md`
- `16-eve-info-discovery-gate.md`
- `17-runtime-smoke-evals.md`

The Gemini implementation uses `@ai-sdk/google` and the Google API. The scaffold Anthropic model is removed. OpenRouter is not enabled in this module.

### 02 — Access and session isolation

- `01-local-schema-parity.md`
- `02-generated-supabase-types.md`
- `03-negative-rls-matrix.md`
- `04-session-owner-schema-hardening.md`
- `05-command-idempotency-schema-hardening.md`
- `06-vector-scope-schema-hardening.md`
- `07-realtime-publication-hardening.md`
- `08-request-scoped-supabase-client.md`
- `09-privileged-job-client.md`
- `10-supabase-jwt-authenticator.md`
- `11-authorized-child-scope-types.md`
- `12-authorize-child-service.md`
- `13-signed-child-context-token.md`
- `14-session-ownership-repository.md`
- `15-revocation-and-expiry.md`
- `16-session-route-ownership-tests.md`

### 03 — Clinical governance

- `01-clinical-source-contract.md`
- `02-rule-pack-artifact-format.md`
- `03-rule-pack-checksum-verifier.md`
- `04-algorithm-registry.md`
- `05-active-pack-resolver.md`
- `06-jurisdiction-and-effective-date-selection.md`
- `07-dr-trujillo-approval-gate.md`
- `08-clinical-package-storage.md`
- `09-clinical-package-release-workflow.md`
- `10-clinical-package-rollback.md`
- `11-clinical-governance-evals.md`

### 04 — Safety and emergency boundary

- `01-normalized-message-types.md`
- `02-spanish-and-english-normalization.md`
- `03-negation-and-quotation-detection.md`
- `04-temperature-and-unit-normalization.md`
- `05-age-expression-normalization.md`
- `06-red-flag-rule-pack.md`
- `07-deterministic-red-flag-engine.md`
- `08-approved-emergency-copy.md`
- `09-professional-recommendation-policy.md`
- `10-clinical-response-policy.md`
- `11-pre-llm-safety-preflight.md`
- `12-safety-evaluation-persistence.md`
- `13-red-flag-boundary-evals.md`
- `14-diagnosis-and-prescription-abstention-evals.md`

An urgent result directly recommends going to the emergency department. It never contains an alarm, notification, phone number, call, map, location action, booking, appointment, clinician contact, or diagnostic statement.

### 05 — Anthropometry and growth

- `01-anthropometry-domain-types.md`
- `02-chronological-age-engine.md`
- `03-corrected-age-engine.md`
- `04-anthropometric-unit-normalization.md`
- `05-measurement-capture-validation.md`
- `06-measurement-duplicate-detection.md`
- `07-who-growth-dataset.md`
- `08-cdc-growth-dataset.md`
- `09-growth-standard-selector.md`
- `10-z-score-engine.md`
- `11-percentile-derivation.md`
- `12-growth-assessment-engine.md`
- `13-growth-series-query.md`
- `14-anthropometry-repository.md`
- `15-growth-reproducibility-tests.md`

### 06 — Immunization

- `01-immunization-domain-types.md`
- `02-vaccine-product-and-antigen-registry.md`
- `03-colombia-pai-rule-pack.md`
- `04-us-acip-rule-pack.md`
- `05-vaccine-evidence-draft-policy.md`
- `06-vaccine-administration-validation.md`
- `07-product-to-antigen-resolution.md`
- `08-minimum-interval-engine.md`
- `09-series-dependency-engine.md`
- `10-catch-up-engine.md`
- `11-dose-status-classification.md`
- `12-vaccination-assessment-persistence.md`
- `13-country-change-reevaluation.md`
- `14-immunization-fixtures-and-evals.md`

PAI and ACIP remain separate packages and are never merged into one active schedule.

### 07 — Medication and adherence

- `01-medication-domain-types.md`
- `02-medication-plan-schema-hardening.md`
- `03-medication-operation-idempotency.md`
- `04-medication-concept-resolver.md`
- `05-medication-presentation-resolver.md`
- `06-formulary-version-resolver.md`
- `07-pediatric-dose-limit-selector.md`
- `08-recent-verified-weight-resolver.md`
- `09-concentration-conversion-engine.md`
- `10-per-dose-limit-comparison.md`
- `11-daily-and-absolute-maximum-comparison.md`
- `12-dose-validation-status-mapping.md`
- `13-dose-validation-persistence.md`
- `14-medication-plan-service.md`
- `15-medication-schedule-service.md`
- `16-medication-intake-service.md`
- `17-adherence-summary-query.md`
- `18-medication-fixtures-and-evals.md`

Dose validation only compares an already-declared dose. It never selects a medicine, creates an alternative dose, prescribes, or states that administration is safe.

### 08 — Nutrition and development

- `01-nutrition-domain-types.md`
- `02-nutrition-profile-query.md`
- `03-food-reaction-query.md`
- `04-nutrition-eligibility-engine.md`
- `05-approved-guidance-content.md`
- `06-menu-and-recipe-composer.md`
- `07-texture-and-choking-policy.md`
- `08-nutrition-abstention-policy.md`
- `09-development-domain-types.md`
- `10-development-framework-resolver.md`
- `11-caregiver-safe-milestone-query.md`
- `12-development-observation-validation.md`
- `13-development-observation-idempotency.md`
- `14-development-observation-service.md`
- `15-development-attachment-policy.md`
- `16-ead3-professional-boundary.md`
- `17-nutrition-and-development-evals.md`

### 09 — Clinical memory and documents

- `01-memory-domain-types.md`
- `02-memory-candidate-schema.md`
- `03-sensitive-memory-confirmation-policy.md`
- `04-memory-candidate-service.md`
- `05-memory-confirmation-service.md`
- `06-google-embedding-provider.md`
- `07-memory-embedding-indexer.md`
- `08-child-scoped-vector-search.md`
- `09-memory-prompt-injection-boundary.md`
- `10-memory-retention-and-deletion.md`
- `11-document-domain-types.md`
- `12-upload-metadata-policy.md`
- `13-scoped-object-path-assignment.md`
- `14-private-upload-ticket.md`
- `15-document-callback-verification.md`
- `16-document-link-service.md`
- `17-private-download-ticket.md`
- `18-document-extraction-draft-policy.md`
- `19-memory-and-document-isolation-evals.md`

Vector retrieval structurally filters both `care_space_id` and `child_id` before similarity ordering.

### 10 — Eve tools and presenters

Shared infrastructure:

- `01-trusted-tool-context.md`
- `02-tool-permission-policy.md`
- `03-tool-approval-policy.md`
- `04-tool-idempotency-wrapper.md`
- `05-tool-audit-wrapper.md`
- `06-safe-tool-errors.md`
- `07-safe-to-model-output.md`

One document per tool:

- `08-tool-evaluate-vaccination-schedule.md`
- `09-tool-get-growth-summary.md`
- `10-tool-suggest-pediatric-nutrition.md`
- `11-tool-validate-declared-pediatric-dose.md`
- `12-tool-register-anthropometry.md`
- `13-tool-record-vaccine-administration.md`
- `14-tool-create-medication-plan.md`
- `15-tool-record-medication-intake.md`
- `16-tool-record-development-observation.md`
- `17-tool-capture-clinical-memory-candidate.md`
- `18-tool-search-child-clinical-memory.md`
- `19-tool-prepare-private-document-upload.md`
- `20-tool-generate-vaccination-card.md`

One document per presenter:

- `21-presenter-growth-summary.md`
- `22-presenter-vaccination-status.md`
- `23-presenter-medication-schedule-preview.md`
- `24-presenter-development-observation-prompt.md`
- `25-presenter-nutrition-guidance.md`
- `26-presenter-guardian-confirmation.md`
- `27-presenter-professional-recommendation.md`
- `28-presenter-emergency-recommendation.md`
- `29-presenter-source-list.md`
- `30-presenter-dose-validation.md`
- `31-presenter-tool-state.md`
- `32-widget-registry-and-versioning.md`
- `33-tool-contract-evals.md`

`evaluate_red_flags` is intentionally absent as an Eve tool. It is the deterministic pre-LLM operation defined in module `04`.

### 11 — Creciendo channel and streaming

- `01-channel-contract-types.md`
- `02-custom-creciendo-channel-shell.md`
- `03-channel-auth-middleware.md`
- `04-child-context-route.md`
- `05-session-create-route.md`
- `06-session-message-route.md`
- `07-session-stream-route.md`
- `08-session-cancel-route.md`
- `09-continuation-token-policy.md`
- `10-event-sequence-and-cursor.md`
- `11-eve-to-mobile-event-mapping.md`
- `12-ndjson-encoder.md`
- `13-reasoning-event-suppression.md`
- `14-safe-stream-error-mapping.md`
- `15-session-revocation-during-stream.md`
- `16-mobile-contract-fixtures.md`
- `17-stream-reconnect-and-cancel-tests.md`
- `18-internal-eve-channel-policy.md`

The standard `/eve/v1/*` channel remains an internal/operator surface. Creciendo uses the custom authenticated channel and cannot inspect a session merely by knowing its session ID.

### 12 — Persistence, workflows, and Realtime

- `01-session-event-projection.md`
- `02-message-event-projection.md`
- `03-tool-execution-projection.md`
- `04-audit-event-projection.md`
- `05-projection-replay-idempotency.md`
- `06-conversation-summary-workflow.md`
- `07-memory-embedding-workflow.md`
- `08-vaccination-card-pdf-workflow.md`
- `09-clinical-package-reevaluation-workflow.md`
- `10-document-processing-workflow.md`
- `11-retention-cleanup-workflow.md`
- `12-medication-reminder-workflow.md`
- `13-retention-schedule.md`
- `14-commerce-reconciliation-schedule.md`
- `15-private-realtime-invalidation-schema.md`
- `16-realtime-invalidation-publisher.md`
- `17-realtime-reconciliation-client-contract.md`
- `18-workflow-replay-and-failure-tests.md`

Urgent safety decisions never enter a background workflow or notification system.

### 13 — Commerce and entitlements

- `01-internal-plan-and-capability-catalog.md`
- `02-billing-event-inbox-schema.md`
- `03-stripe-webhook-ingress.md`
- `04-apple-notification-ingress.md`
- `05-google-play-notification-ingress.md`
- `06-billing-event-normalization.md`
- `07-purchase-projection.md`
- `08-entitlement-projection.md`
- `09-usage-ledger-service.md`
- `10-provider-event-ordering.md`
- `11-commerce-reconciliation-workflow.md`
- `12-flags-versus-entitlements-policy.md`
- `13-commerce-idempotency-and-convergence-tests.md`

Entitlements belong to care spaces, never to model claims or individual children. Urgent safety output is not paywalled.

### 14 — Model fallback, observability, and evals

- `01-model-policy-types.md`
- `02-openrouter-provider-adapter.md`
- `03-provider-failure-classification.md`
- `04-pre-stream-failover-adapter.md`
- `05-no-mid-stream-replay-policy.md`
- `06-provider-circuit-breaker.md`
- `07-token-latency-and-cost-budgets.md`
- `08-gemini-openrouter-parity-gate.md`
- `09-provider-abstention-path.md`
- `10-observability-event-schema.md`
- `11-otel-redaction-policy.md`
- `12-agent-runs-privacy-review.md`
- `13-clinical-safety-eval-suite.md`
- `14-cross-child-isolation-eval-suite.md`
- `15-prompt-injection-eval-suite.md`
- `16-tool-misuse-eval-suite.md`
- `17-streaming-recovery-eval-suite.md`
- `18-telemetry-privacy-eval-suite.md`
- `19-eval-ci-and-junit.md`
- `20-release-evidence-bundle.md`

OpenRouter remains disabled until the parity gate is completed with zero critical safety, isolation, authorization, and tool-contract failures.

### 15 — Deployment and production

- `01-environment-matrix.md`
- `02-vercel-project-linkage.md`
- `03-preview-build-and-deploy.md`
- `04-preview-smoke-suite.md`
- `05-production-secret-policy.md`
- `06-database-migration-promotion-gate.md`
- `07-backup-and-restore-rehearsal.md`
- `08-dependency-and-secret-scan.md`
- `09-provider-outage-runbook.md`
- `10-supabase-outage-runbook.md`
- `11-session-recovery-runbook.md`
- `12-access-revocation-runbook.md`
- `13-webhook-replay-runbook.md`
- `14-workflow-replay-runbook.md`
- `15-clinical-package-release-runbook.md`
- `16-data-export-and-deletion-runbook.md`
- `17-colombia-controlled-rollout.md`
- `18-us-support-activation-gate.md`
- `19-legacy-ingress-cutover.md`
- `20-production-rollback.md`
- `21-final-production-readiness-gate.md`

Colombia is the first production jurisdiction. United States support is implemented and evaluated but activates only after its clinical packages, legal review, provider configuration, and release gate are complete.

## 10. Cross-cutting clinical and product invariants

Every work unit inherits these rules:

1. Agent Trujillo provides basic pediatric education, organization, and guidance.
2. It never diagnoses, confirms a diagnosis, prescribes, selects a medicine, or replaces professional care.
3. Non-urgent cases outside scope recommend a pediatrician without contacting, booking, escalating to, or opening a case for the Dr. Trujillo.
4. Urgent cases directly recommend going to the emergency department and do nothing else.
5. Red-flag handling is deterministic, synchronous, pre-LLM, and independent of model, workflow, entitlement, notification, or clinician availability.
6. The model never calculates Z-scores, percentiles, vaccine eligibility, medication limits, corrected age, or clinical rule outcomes.
7. Every clinical operation derives authority from an immutable `AuthorizedChildScope`.
8. Model-facing schemas never accept `child_id`, `care_space_id`, `guardian_id`, authoritative country, or permission claims.
9. Memory and vector retrieval filter by care space and child before similarity.
10. Clinical packages require versioned sources, algorithms, checksums, effective dates, fixtures, and Dr. Trujillo approval.
11. Colombia and United States rule packs remain jurisdictionally separate.
12. Sensitive writes are confirmed, idempotent, auditable, and safe under Eve replay.
13. Prompts, reasoning, raw clinical content, secrets, and unnecessary PHI/PII are excluded from telemetry.
14. Flags may control rollout but never authorization, clinical safety, or entitlement truth.
15. Failure to authenticate, authorize, resolve a rule, call a provider, or persist safely results in denial, abstention, or a recoverable error; it never broadens access or invents a clinical result.

## 11. Technical baselines

- Node.js: `24.x`.
- TypeScript: strict mode.
- Eve: installed version `0.27.1`; workers must read `node_modules/eve/docs/README.md` and the relevant installed pages before Eve changes.
- AI SDK: the version compatible with installed Eve.
- Primary model provider: Google Gemini through `@ai-sdk/google` and the direct Google API.
- Provider credential: server-only canonical Google provider environment variable.
- Fallback: OpenRouter only after module `14` parity approval.
- Validation: Zod schemas at trust boundaries.
- Persistence: Supabase/PostgreSQL with generated types, forced RLS, private Storage, pgvector, and request-scoped clients.
- Unit/integration testing: Vitest plus Supabase database tests.
- Agent behavior testing: Eve evals under root `evals/`.
- Deployment: Vercel-hosted Eve runtime and durable workflow facilities unless a later approved ADR changes the host.

Exact model IDs and provider package versions are verified against the live provider/package catalog by their owning work units and then pinned. The roadmap must not reuse the scaffold model or confuse Vercel AI Gateway identifiers with provider-native Google model identifiers.

## 12. Verification hierarchy

Verification runs from narrowest to broadest:

1. leaf unit tests;
2. leaf integration tests;
3. affected module tests;
4. TypeScript typecheck;
5. Eve build and `eve info` discovery inspection;
6. Supabase reset, database tests, and lint when data behavior changes;
7. affected Eve eval groups;
8. system-wide critical safety and isolation gates;
9. preview deployment smoke tests for release work;
10. evidence and staged-content review before commit.

No unit is completed based on an earlier run or worker summary. The root agent uses fresh output from the commands declared by the leaf document.

## 13. Commit and roadmap update policy

One completed leaf document normally produces one commit. A parallel group may produce separate commits per leaf, preserving independent review and rollback.

The root agent stages only paths allowed by the work unit, checks the staged diff, scans for forbidden files and secrets, and commits with the message specified in frontmatter. After the implementation commit, it updates roadmap evidence without rewriting unrelated status entries.

Pushes, pull requests, remote database mutations, production deployments, provider configuration, and clinical package activation require the authority stated by the relevant leaf document and are never inferred from permission to edit code.

## 14. Design acceptance criteria

The roadmap implementation is acceptable when:

- both `AGENTS.md` and `ROADMAP.md` fully describe the harness protocol;
- all fifteen module directories and module READMEs exist;
- every leaf in the manifest has an English Markdown document;
- every document has valid metadata and complete sections;
- dependency IDs resolve with no cycles;
- parallel groups have no overlapping exclusive paths;
- every Eve tool has its own document;
- every clinical engine and presenter has its own document;
- each route, workflow, webhook, and release gate is independently documented;
- all current architecture and schema inconsistencies discovered by the audits have owning work units;
- no placeholders or vague implementation instructions remain;
- local Markdown links resolve;
- the roadmap can identify at least one ready unit and cannot select blocked work;
- repository secrets and `.env` values are absent from documentation and commits.

## 15. Deliberate exclusions

This design does not implement Agent Trujillo, change Supabase, install provider packages, enable OpenRouter, create clinical rule packs, or deploy an agent. It defines the documentation and orchestration system that will govern those changes.

The Creciendo mobile roadmap is a separate design and will reuse the same harness semantics after the Agent Trujillo roadmap is complete and reviewed.
