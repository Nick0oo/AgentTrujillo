# Agent Trujillo Roadmap Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the repository-native execution harness for Agent Trujillo: root worker instructions, a canonical roadmap ledger, reusable Markdown templates, fifteen ordered module indexes, and 264 complete atomic work-unit documents.

**Architecture:** `AGENTS.md` owns immutable worker rules, `ROADMAP.md` owns execution state, and `roadmap/<module>/` owns atomic implementation specifications. Each leaf document is an independently assignable unit with machine-readable metadata, exact file ownership, technical contracts, TDD steps, clinical safeguards, verification evidence, and a commit boundary. Modules may be authored in parallel after the root contract and templates are complete because they write disjoint directories; cross-module dependency validation is a final sequential gate.

**Tech Stack:** English Markdown, YAML frontmatter, Git, PowerShell verification, Eve `0.27.1` bundled documentation as the framework source of truth, GPT-5.6 Luna workers with reasoning `max`.

## Global Constraints

- The authoritative design is `docs/superpowers/specs/2026-08-15-agent-roadmap-harness-design.md` at commit `08ed71a`.
- The executable roadmap starts at module `01`; the deployed Supabase foundation is a prerequisite, not module `00`.
- All new or rewritten roadmap documents are in English.
- Every implementation leaf uses model `gpt-5.6-luna` with reasoning `max` in frontmatter.
- One leaf document describes one independently reviewable outcome.
- Every Eve tool, clinical engine, presenter, channel route, workflow, webhook, and release gate has its own leaf document.
- Agent Trujillo never diagnoses, prescribes, selects medication, or replaces professional care.
- Non-urgent out-of-scope cases recommend a pediatrician without contact, booking, escalation, or case creation.
- Urgent cases only recommend going directly to the emergency department; no alarm, call, map, phone, booking, notification, location action, or doctor handoff is produced.
- `evaluate_red_flags` is deterministic pre-LLM behavior and is never exposed as an Eve tool.
- Gemini uses Google's direct API through `@ai-sdk/google`; OpenRouter remains disabled until its parity gate completes.
- No task may read or stage `.env`, secret values, `node_modules`, `.eve`, build output, or `supabase/legacy-reference` content.
- Roadmap authoring does not implement product code, mutate Supabase, install packages, deploy, or enable providers.
- Existing unrelated repository changes must be preserved.
- Each task ends with fresh verification and one focused commit.

---

### Task 1: Root harness contract and templates

**Files:**

- Modify: `AGENTS.md`
- Modify: `ROADMAP.md`
- Create: `roadmap/README.md`
- Create: `roadmap/_templates/task.md`
- Create: `roadmap/_templates/clinical-engine.md`
- Create: `roadmap/_templates/tool.md`
- Create: `roadmap/_templates/database-change.md`
- Create: `roadmap/_templates/workflow.md`
- Create: `roadmap/_templates/release-gate.md`

**Interfaces:**

- Consumes: the approved design specification and existing clinical/architecture contracts.
- Produces: the frontmatter schema, document section contract, status state machine, worker selection algorithm, concurrency rules, evidence format, and module index that every later task must use verbatim.

- [ ] **Step 1: Verify the repository baseline**

Run:

```powershell
git status --short
git branch --show-current
git log -3 --oneline
```

Expected: the design commit is present and no undocumented working-tree change overlaps the target files.

- [ ] **Step 2: Rewrite `AGENTS.md` as the harness contract**

Include the exact reading order, Luna/max requirement, root-versus-worker responsibilities, status state machine, sequential/parallel selection rules, maximum of three simultaneous workers, exclusive-path collision rules, clinical invariants, Eve installed-doc requirement, secret/PHI restrictions, destructive-operation rules, verification protocol, commit protocol, and conflict-stop behavior from design sections 4, 7, 8, 10, 11, 12, and 13.

- [ ] **Step 3: Rewrite `ROADMAP.md` as the execution ledger**

Include verified prerequisites, all fifteen modules in order, module status, exit-gate status, next eligible task slots, active-worker table, blocker table, evidence/commit columns, and links to every module README. Mark every module `pending` until its own documentation exists and passes review.

- [ ] **Step 4: Create `roadmap/README.md`**

Define every frontmatter field and status transition. State that leaf frontmatter is authoritative for dependencies and ownership while `ROADMAP.md` is the operational projection. Define how to select ready work, claim paths, run parallel groups, return failed reviews to `in_progress`, amend completed work, and format completion reports.

- [ ] **Step 5: Create the six templates**

Every template must contain the approved YAML fields and all 23 ordered sections from design section 6. Specialized templates add:

- clinical engine: datasets, algorithm version, clinical package, jurisdiction, checksum, deterministic fixtures, clinical approval;
- tool: Eve `defineTool`, Zod input/output, trusted scope, permission, approval, idempotency, `toModelOutput`, presenter, audit, evals;
- database change: forward migration, rollback strategy, RLS/grants, generated types, local/linked verification, data safety;
- workflow: trigger, durable steps, idempotency, retries, permanent/transient failures, scheduling, operator replay;
- release gate: prerequisites, zero-tolerance gates, evidence bundle, rollback, activation authority.

- [ ] **Step 6: Verify the root contract**

Run:

```powershell
git diff --check
rg -n "gpt-5\.6-luna|reasoning: max|exclusive_paths|parallel_group|AuthorizedChildScope|emergency department" AGENTS.md ROADMAP.md roadmap
rg -n --ignore-case "\b(TBD|TODO|FIXME|implement later|handle edge cases)\b" AGENTS.md ROADMAP.md roadmap
```

Expected: required contract terms are present; placeholder scan has no hits except explicit text prohibiting placeholders.

- [ ] **Step 7: Commit**

```powershell
git add AGENTS.md ROADMAP.md roadmap/README.md roadmap/_templates
git diff --cached --check
git commit -m "docs: establish agent roadmap harness"
```

---

### Task 2: Module 01 — Runtime and harness

**Files:**

- Create: `roadmap/01-runtime-and-harness/README.md`
- Create: the 17 leaf documents listed under design section `9`, module `01`.

**Interfaces:**

- Consumes: Task 1 templates and Eve `0.27.1` installed docs.
- Produces: IDs `AT-01-01` through `AT-01-17`; runtime baseline consumed by modules `02`, `10`, `11`, and `14`.

- [ ] **Step 1:** Write the module README with entry gate, exit gate, dependency graph, sequential tasks, safe parallel groups, and all 17 linked IDs.
- [ ] **Step 2:** Create one complete leaf per manifest entry, covering Eve version/docs, dependencies, Gemini direct provider, environment validation, limits/compaction, instructions, three runtime skills, removal of the developer skill from production context, default-tool lockdown, sandbox policy, privacy instrumentation, discovery, and smoke evals.
- [ ] **Step 3:** Verify every leaf pins its exact future source/test paths and uses provider-native Google identifiers rather than AI Gateway identifiers.
- [ ] **Step 4:** Run module placeholder, metadata, link, and `git diff --check` verification.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define runtime and harness module"`.

---

### Task 3: Module 02 — Access and session isolation

**Files:**

- Create: `roadmap/02-access-and-session-isolation/README.md`
- Create: the 16 leaf documents listed under design section `9`, module `02`.

**Interfaces:**

- Consumes: `AT-01-02`, `AT-01-04`, installed Supabase schema, RLS policies, and session tables.
- Produces: immutable `AuthorizedChildScope`, request and privileged-client boundaries, child-context tokens, session ownership, schema-hardening tasks, and access gates consumed by all clinical, tool, channel, memory, workflow, and commerce modules.

- [ ] **Step 1:** Define module entry/exit gates and dependencies without describing the already-applied database foundation as new work.
- [ ] **Step 2:** Create one leaf for each exact manifest entry, including generated types, negative RLS testing, session ownership hardening, missing idempotency, vector two-dimensional scope, Realtime hardening, clients, JWT auth, authorization, signed child context, revocation, and route ownership tests.
- [ ] **Step 3:** Ensure every leaf defines indistinguishable denial behavior for missing, sibling, foreign-space, revoked, and expired access.
- [ ] **Step 4:** Verify metadata, links, collisions, placeholders, and diff formatting.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define access and isolation module"`.

---

### Task 4: Module 03 — Clinical governance

**Files:**

- Create: `roadmap/03-clinical-governance/README.md`
- Create: the 11 leaf documents listed under design section `9`, module `03`.

**Interfaces:**

- Consumes: access scope and existing clinical source/package tables.
- Produces: approved source, artifact, checksum, algorithm, jurisdiction, effective-date, Dr. Trujillo approval, release, and rollback contracts used by modules `04` through `09`.

- [ ] **Step 1:** Write the module graph and clinical approval gate.
- [ ] **Step 2:** Create all 11 governance leaves with exact repositories, scripts, tables, Storage bucket, artifact format, methods, fixtures, failure behavior, and approval evidence.
- [ ] **Step 3:** Ensure no worker can activate a package based only on model output, fetched content, or database status without matching approval hash.
- [ ] **Step 4:** Verify the module documentation.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define clinical governance module"`.

---

### Task 5: Module 04 — Safety and emergency boundary

**Files:**

- Create: `roadmap/04-safety-and-emergency-boundary/README.md`
- Create: the 14 leaf documents listed under design section `9`, module `04`.

**Interfaces:**

- Consumes: authorized scope, active approved safety package, normalization inputs.
- Produces: deterministic `SafetyDecision`, approved emergency output, professional-review policy, response policy, and pre-LLM safety gate used by the channel and every conversation turn.

- [ ] **Step 1:** Write the module graph with the pre-LLM gate as a strict sequential dependency.
- [ ] **Step 2:** Create all normalization, rule-pack, engine, copy, response-policy, persistence, and eval leaves.
- [ ] **Step 3:** State in every relevant leaf that urgent output only directs the user to the emergency department and cannot contain actions, contact, booking, map, phone, notification, alarm, diagnosis, or home treatment.
- [ ] **Step 4:** Verify `evaluate_red_flags` is never documented as an Eve tool.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define safety boundary module"`.

---

### Task 6: Module 05 — Anthropometry and growth

**Files:**

- Create: `roadmap/05-anthropometry-and-growth/README.md`
- Create: the 15 leaf documents listed under design section `9`, module `05`.

**Interfaces:**

- Consumes: clinical package resolution and authorized scope.
- Produces: chronological/corrected age, units, capture validation, versioned WHO/CDC datasets, Z-score/percentile engines, growth assessments, series queries, repositories, and reproducibility gates.

- [ ] **Step 1:** Define ordered engine dependencies and safe dataset/repository parallel groups.
- [ ] **Step 2:** Create all 15 leaves with exact types, functions, dataset paths, checksum policy, tables, fixtures, boundary cases, and diagnostic-language exclusions.
- [ ] **Step 3:** Ensure no downstream engine performs its own age arithmetic or model-based calculation.
- [ ] **Step 4:** Verify documentation completeness and consistency.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define anthropometry and growth module"`.

---

### Task 7: Module 06 — Immunization

**Files:**

- Create: `roadmap/06-immunization/README.md`
- Create: the 14 leaf documents listed under design section `9`, module `06`.

**Interfaces:**

- Consumes: age engine, clinical governance, scope, and vaccine reference tables.
- Produces: separate PAI/ACIP packs, evidence/administration rules, interval/dependency/catch-up engines, assessment persistence, and country-change reevaluation.

- [ ] **Step 1:** Define the module graph and explicit PAI-versus-ACIP isolation.
- [ ] **Step 2:** Create all 14 leaves with exact rule inputs/outputs, tables, methods, draft/confirmed provenance, jurisdiction behavior, fixtures, and evals.
- [ ] **Step 3:** Ensure OCR/photo evidence remains a draft and special schedules/contraindications resolve to professional review rather than model judgment.
- [ ] **Step 4:** Verify module documents.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define immunization module"`.

---

### Task 8: Module 07 — Medication and adherence

**Files:**

- Create: `roadmap/07-medication-and-adherence/README.md`
- Create: the 18 leaf documents listed under design section `9`, module `07`.

**Interfaces:**

- Consumes: scope, clinical packages, recent verified anthropometry, medication tables, and schema-hardening tasks.
- Produces: concept/presentation/formulary resolution, deterministic declared-dose comparison, plans, schedules, intakes, adherence summaries, and conservative status mapping.

- [ ] **Step 1:** Define the schema-hardening and deterministic-calculation sequence.
- [ ] **Step 2:** Create all 18 leaves with exact calculations, units, types, persistence mappings, idempotency, tables, reference-source limits, fixtures, and abstention cases.
- [ ] **Step 3:** Ensure no leaf permits medicine selection, alternative dosing, prescription, diagnosis, or the word “safe” as a validation conclusion.
- [ ] **Step 4:** Verify module documents.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define medication and adherence module"`.

---

### Task 9: Module 08 — Nutrition and development

**Files:**

- Create: `roadmap/08-nutrition-and-development/README.md`
- Create: the 17 leaf documents listed under design section `9`, module `08`.

**Interfaces:**

- Consumes: age/corrected-age, scope, approved content packages, food reactions, nutrition profile, development tables, and documents.
- Produces: bounded nutrition eligibility/guidance, choking policy, caregiver-safe milestones, development observations, and an explicit EAD-3 professional boundary.

- [ ] **Step 1:** Define nutrition and development as separate parallel subgraphs under one module gate.
- [ ] **Step 2:** Create all 17 leaves with exact methods, data, tables, abstention conditions, attachment rules, idempotency, fixtures, and evals.
- [ ] **Step 3:** Require pediatrician recommendation for severe allergy, therapeutic diet, failure to thrive, dysphagia, or other professional-review cases without clinician contact or booking.
- [ ] **Step 4:** Verify module documents.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define nutrition and development module"`.

---

### Task 10: Module 09 — Clinical memory and documents

**Files:**

- Create: `roadmap/09-clinical-memory-and-documents/README.md`
- Create: the 19 leaf documents listed under design section `9`, module `09`.

**Interfaces:**

- Consumes: scope, vector hardening, package policy, private Storage, messages, and documents tables.
- Produces: candidates, confirmations, Google embeddings, scoped search, injection boundaries, retention, private upload/download tickets, callbacks, document links, and draft extraction.

- [ ] **Step 1:** Define memory and document subgraphs plus their shared isolation gate.
- [ ] **Step 2:** Create all 19 leaves with exact schemas, methods, embedding dimensions/versioning, structural filters, Storage operations, callbacks, MIME/checksum rules, SSRF prevention, and tests.
- [ ] **Step 3:** Require `care_space_id` and `child_id` filters before vector similarity and prohibit arbitrary URLs.
- [ ] **Step 4:** Verify module documents.
- [ ] **Step 5:** Commit with `git commit -m "docs(roadmap): define memory and documents module"`.

---

### Task 11: Module 10 — Eve tools and presenters

**Files:**

- Create: `roadmap/10-eve-tools-and-presenters/README.md`
- Create: the 33 leaf documents listed under design section `9`, module `10`.

**Interfaces:**

- Consumes: every completed domain interface from modules `02` through `09`.
- Produces: shared Eve tool infrastructure, thirteen independently documented tools, eleven independently documented presenters, widget registry/versioning, and tool contract evals.

- [ ] **Step 1:** Define shared infrastructure as sequential prerequisites and identify safe parallel groups for individual read tools, write tools, and presenters.
- [ ] **Step 2:** Create the seven shared tool-policy leaves with exact Eve/Zod APIs, scope resolution, permission, approval, idempotency, audit, error, and `toModelOutput` contracts.
- [ ] **Step 3:** Create one complete Markdown file for each of the thirteen tools in the design manifest. Every file must contain exact future source/test paths, input/output schemas, method signatures, tables/RPCs, permission, confirmation, idempotency, presenter, failure behavior, tests, evals, evidence, and commit message.
- [ ] **Step 4:** Create one complete Markdown file for each presenter and the widget registry. Emergency presenter schemas must explicitly reject action/contact/location fields.
- [ ] **Step 5:** Create the tool-contract eval leaf and verify no authority-bearing IDs appear in model input schemas.
- [ ] **Step 6:** Verify all 33 documents and commit with `git commit -m "docs(roadmap): define Eve tools and presenters module"`.

---

### Task 12: Module 11 — Creciendo channel and streaming

**Files:**

- Create: `roadmap/11-creciendo-channel-and-streaming/README.md`
- Create: the 18 leaf documents listed under design section `9`, module `11`.

**Interfaces:**

- Consumes: scope, session ownership, safety preflight, tools/presenters, and existing mobile contract.
- Produces: custom channel, one leaf per route, continuation/cursor policy, Eve-to-mobile mapping, NDJSON encoder, reasoning suppression, safe errors, fixtures, reconnect/cancel tests, and internal Eve-channel policy.

- [ ] **Step 1:** Define the route and streaming dependency graph.
- [ ] **Step 2:** Create all 18 leaves with exact Eve `defineChannel`, `GET`, `POST`, `send`, `cancel`, `getSession`, event-stream, auth, cursor, and error contracts.
- [ ] **Step 3:** Ensure every start, follow-up, stream, cancel, and inspection path rechecks session ownership and revocation.
- [ ] **Step 4:** Ensure reasoning, raw tool arguments, SQL, prompts, provider errors, and unauthorized resource existence never reach Creciendo.
- [ ] **Step 5:** Verify and commit with `git commit -m "docs(roadmap): define Creciendo channel module"`.

---

### Task 13: Module 12 — Persistence, workflows, and Realtime

**Files:**

- Create: `roadmap/12-persistence-workflows-and-realtime/README.md`
- Create: the 18 leaf documents listed under design section `9`, module `12`.

**Interfaces:**

- Consumes: Eve stream events, Supabase repositories, memory/documents, clinical governance, reminders, and Realtime hardening.
- Produces: idempotent event projections, summaries, embeddings, PDFs, package reevaluation, document processing, retention, reminder workflows/schedules, and invalidation-only Realtime.

- [ ] **Step 1:** Define projections, workflows, schedules, and Realtime as separate parallel groups after shared persistence contracts.
- [ ] **Step 2:** Create all 18 leaves with exact triggers, methods, tables, statuses, idempotency keys, retry classes, operator replay, schedules, payload schemas, and tests.
- [ ] **Step 3:** Prohibit workflows, schedules, Realtime, reminders, and notifications from urgent safety decisions.
- [ ] **Step 4:** Verify and commit with `git commit -m "docs(roadmap): define persistence and workflows module"`.

---

### Task 14: Module 13 — Commerce and entitlements

**Files:**

- Create: `roadmap/13-commerce-and-entitlements/README.md`
- Create: the 13 leaf documents listed under design section `9`, module `13`.

**Interfaces:**

- Consumes: care-space scope, billing tables, system workflows, and provider ingress credentials.
- Produces: provider-neutral plan catalog, verified webhook inboxes, normalized ledger, purchase/entitlement/usage projections, reconciliation, flag separation, and convergence tests.

- [ ] **Step 1:** Define ingress append-only behavior before projections.
- [ ] **Step 2:** Create all 13 leaves with exact provider signature APIs, raw-body verification, event schemas, idempotency, ordering, tables, projection methods, failure behavior, and tests.
- [ ] **Step 3:** State that webhooks only verify and append; they never call a model, clinical tool, or directly grant premium access.
- [ ] **Step 4:** Verify and commit with `git commit -m "docs(roadmap): define commerce and entitlements module"`.

---

### Task 15: Module 14 — Model fallback, observability, and evals

**Files:**

- Create: `roadmap/14-model-fallback-observability-and-evals/README.md`
- Create: the 20 leaf documents listed under design section `9`, module `14`.

**Interfaces:**

- Consumes: Gemini runtime, full clinical/tool/channel system, instrumentation baseline, and release evidence requirements.
- Produces: disabled-by-default OpenRouter adapter, classified pre-stream failover, no-mid-stream-replay policy, circuit breaker, budgets, parity gate, abstention, redacted OTel/Agent Runs policy, critical eval suites, CI, and evidence bundles.

- [ ] **Step 1:** Define failover tasks as sequential and eval suites as safe parallel groups after the adapter contracts exist.
- [ ] **Step 2:** Create all 20 leaves with exact AI SDK provider interfaces, error classes, retry boundaries, budgets, metrics, redaction fields, Eve eval APIs, datasets, zero-tolerance gates, commands, and artifacts.
- [ ] **Step 3:** Ensure OpenRouter remains disabled until parity evidence records zero critical safety, isolation, authorization, and tool-contract failures.
- [ ] **Step 4:** Ensure a stream never restarts on another provider after output begins and a double provider failure abstains safely.
- [ ] **Step 5:** Verify and commit with `git commit -m "docs(roadmap): define fallback observability and evals module"`.

---

### Task 16: Module 15 — Deployment and production

**Files:**

- Create: `roadmap/15-deployment-and-production/README.md`
- Create: the 21 leaf documents listed under design section `9`, module `15`.

**Interfaces:**

- Consumes: all prior module gates and evidence bundle.
- Produces: environment matrix, Vercel linkage/deployment, preview smoke, secret policy, migration promotion, restore rehearsal, scans, operational runbooks, Colombia rollout, US activation gate, legacy cutover, rollback, and final readiness gate.

- [ ] **Step 1:** Define preview, production, jurisdiction activation, cutover, and rollback as sequential gates.
- [ ] **Step 2:** Create all 21 leaves with exact commands, environments, required authorities, smoke scenarios, evidence, failure/block behavior, rollback steps, and no-secret-output rules.
- [ ] **Step 3:** Make Colombia the first production activation and require separate approved US clinical/legal/provider evidence before US activation.
- [ ] **Step 4:** Verify and commit with `git commit -m "docs(roadmap): define deployment and production module"`.

---

### Task 17: Cross-module dependency and documentation gate

**Files:**

- Modify: `ROADMAP.md`
- Modify: `roadmap/README.md` only if validation reveals an ambiguity.
- Modify: module README or leaf documents only to correct verified validation failures.
- Create: `docs/verification/2026-08-16-agent-roadmap.md`

**Interfaces:**

- Consumes: root contract, all fifteen module READMEs, and all 264 leaf documents.
- Produces: a verified acyclic execution graph, collision-safe parallel groups, complete link graph, initial ready-task set, and durable verification report.

- [ ] **Step 1: Inventory the roadmap**

Run a PowerShell inventory that reports:

- fifteen numbered module directories;
- fifteen module READMEs;
- exactly 264 leaf documents from the approved manifest;
- six templates;
- unique work-unit IDs;
- all required frontmatter fields.

Expected: counts and IDs match the approved design.

- [ ] **Step 2: Validate dependencies**

Parse `id`, `depends_on`, and `blocks` from frontmatter. Verify every reference exists, reciprocal blocking relationships are consistent where declared, and the dependency graph has no cycles. Confirm at least one module `01` leaf can be marked `ready` without bypassing a prerequisite.

- [ ] **Step 3: Validate concurrency ownership**

For each `parallel_group`, compare `exclusive_paths` and fail on identical paths, parent-child glob overlap, shared root configuration, shared migration ownership, or shared generated contracts. Convert unsafe groups to sequential and document the dependency.

- [ ] **Step 4: Validate content completeness**

Run:

```powershell
git diff --check
rg -L "^## Outcome$" roadmap/*/*.md
rg -L "^## Completion checklist$" roadmap/*/*.md
rg -L "^## Commit protocol$" roadmap/*/*.md
rg -n --ignore-case "\b(TBD|TODO|FIXME|implement later|fill in|same as|handle edge cases|appropriate error handling)\b" AGENTS.md ROADMAP.md roadmap
```

Expected: every leaf has the complete section contract and no vague placeholders. Explicit rules that prohibit those phrases may be allowlisted in templates and `roadmap/README.md`.

- [ ] **Step 5: Validate local Markdown links**

Extract local Markdown targets from `AGENTS.md`, `ROADMAP.md`, `roadmap/**/*.md`, and the design/plan. Resolve targets relative to each source file and fail on missing files or directories.

- [ ] **Step 6: Verify clinical invariants by search**

Confirm the tool manifest omits a model-visible red-flag tool; emergency documentation contains the emergency-department-only boundary; tool inputs prohibit authority IDs; medication documents prohibit prescriptions/alternative doses; memory documents require pre-similarity scope filtering; and telemetry documents prohibit raw clinical content.

- [ ] **Step 7: Write the verification report**

Record commands, exit codes, counts, exceptions, ready units, module gates, and the current commit chain in `docs/verification/2026-08-16-agent-roadmap.md`. Do not claim product code, clinical datasets, provider activation, or deployment exists.

- [ ] **Step 8: Update the execution ledger**

Mark the roadmap documentation system complete, preserve product modules as implementation-pending, and identify the first ready unit under module `01`.

- [ ] **Step 9: Final commit**

```powershell
git add AGENTS.md ROADMAP.md roadmap docs/verification/2026-08-16-agent-roadmap.md
git diff --cached --check
git commit -m "docs: verify Agent Trujillo execution roadmap"
```

## Execution handoff

Execution is intentionally deferred. This plan must not start until the user gives a new explicit instruction to execute the Agent Trujillo roadmap documentation work.

When execution is authorized, the selected mode is subagent-driven development using fresh GPT-5.6 Luna workers with reasoning `max`. Complete Task 1 sequentially, then author numbered module tasks in parallel waves of at most three workers because their directories are disjoint. The root agent reviews each returned diff and verification evidence before accepting or committing it. Run Task 17 only after every module task is complete.

The Creciendo Expo roadmap is a separate future design cycle. It must begin with its own Superpowers brainstorming and writing-plans stages, read the exact installed/required Expo version documentation, and reuse the harness semantics without copying Agent Trujillo's backend module structure.
