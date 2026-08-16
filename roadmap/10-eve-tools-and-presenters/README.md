# Module 10 — Eve Tools and Presenters

This module is the only model-callable action surface. It wraps modules 02–09 with immutable trusted context, permission, explicit approval, idempotency, audit, safe errors, explicit tool-to-model projections, one file per Eve tool, and versioned accessible mobile presenters.

## Entry gate

- Eve 0.27.1 discovery and Gemini runtime gates pass.
- Modules 02–09 authorization, governance, safety, clinical engines, persistence, memory, and documents pass for each exposed capability.
- Deterministic red-flag preflight remains outside Eve tool calling.
- Model-facing schemas contain no care-space, child, guardian, country, permission, entitlement, package, approval, or clinical result truth.

## Exit gate

All 33 leaves are complete and prove exactly thirteen intended tools, no red-flag/shell/filesystem/network/delegation tools, correct wrapper order, explicit confirmation for effects, replay convergence, safe output projections, privacy-safe audit/errors, accessible versioned widgets, text-only professional/emergency boundaries, mobile compatibility, and zero critical authorization/clinical/action leakage.

## Dependency strategy

Leaves 01–07 are sequential load-bearing infrastructure. Tools 08–20 can run in parallel after 07 and their domain gates because every file is exclusive. Presenters 21–31 can run in parallel after their relevant tools/policies. Registry 32 integrates presenter schemas; eval 33 closes the module.

## Work-unit index

| ID | Work unit | Kind |
|---|---|---|
| [AT-10-01](01-trusted-tool-context.md) | trusted tool context | infrastructure |
| [AT-10-02](02-tool-permission-policy.md) | tool permission policy | infrastructure |
| [AT-10-03](03-tool-approval-policy.md) | tool approval policy | infrastructure |
| [AT-10-04](04-tool-idempotency-wrapper.md) | tool idempotency wrapper | infrastructure |
| [AT-10-05](05-tool-audit-wrapper.md) | tool audit wrapper | infrastructure |
| [AT-10-06](06-safe-tool-errors.md) | safe tool errors | infrastructure |
| [AT-10-07](07-safe-to-model-output.md) | safe to model output | infrastructure |
| [AT-10-08](08-tool-evaluate-vaccination-schedule.md) | tool evaluate vaccination schedule | tool |
| [AT-10-09](09-tool-get-growth-summary.md) | tool get growth summary | tool |
| [AT-10-10](10-tool-suggest-pediatric-nutrition.md) | tool suggest pediatric nutrition | tool |
| [AT-10-11](11-tool-validate-declared-pediatric-dose.md) | tool validate declared pediatric dose | tool |
| [AT-10-12](12-tool-register-anthropometry.md) | tool register anthropometry | tool |
| [AT-10-13](13-tool-record-vaccine-administration.md) | tool record vaccine administration | tool |
| [AT-10-14](14-tool-create-medication-plan.md) | tool create medication plan | tool |
| [AT-10-15](15-tool-record-medication-intake.md) | tool record medication intake | tool |
| [AT-10-16](16-tool-record-development-observation.md) | tool record development observation | tool |
| [AT-10-17](17-tool-capture-clinical-memory-candidate.md) | tool capture clinical memory candidate | tool |
| [AT-10-18](18-tool-search-child-clinical-memory.md) | tool search child clinical memory | tool |
| [AT-10-19](19-tool-prepare-private-document-upload.md) | tool prepare private document upload | tool |
| [AT-10-20](20-tool-generate-vaccination-card.md) | tool generate vaccination card | tool |
| [AT-10-21](21-presenter-growth-summary.md) | presenter growth summary | presenter |
| [AT-10-22](22-presenter-vaccination-status.md) | presenter vaccination status | presenter |
| [AT-10-23](23-presenter-medication-schedule-preview.md) | presenter medication schedule preview | presenter |
| [AT-10-24](24-presenter-development-observation-prompt.md) | presenter development observation prompt | presenter |
| [AT-10-25](25-presenter-nutrition-guidance.md) | presenter nutrition guidance | presenter |
| [AT-10-26](26-presenter-guardian-confirmation.md) | presenter guardian confirmation | presenter |
| [AT-10-27](27-presenter-professional-recommendation.md) | presenter professional recommendation | presenter |
| [AT-10-28](28-presenter-emergency-recommendation.md) | presenter emergency recommendation | presenter |
| [AT-10-29](29-presenter-source-list.md) | presenter source list | presenter |
| [AT-10-30](30-presenter-dose-validation.md) | presenter dose validation | presenter |
| [AT-10-31](31-presenter-tool-state.md) | presenter tool state | presenter |
| [AT-10-32](32-widget-registry-and-versioning.md) | widget registry and versioning | presenter |
| [AT-10-33](33-tool-contract-evals.md) | tool contract evals | gate |

## Intended Eve tool catalog

- Read-only: vaccination schedule, growth summary, nutrition guidance, declared-dose comparison, confirmed-memory search.
- Consequential/draft: anthropometry, vaccine administration, medication plan, medication intake, development observation, memory candidate, private upload preparation, vaccination-card generation.
- There is no evaluate_red_flags or trigger_red_flag_alert tool. Urgent detection is synchronous pre-LLM and emits only the emergency-department recommendation.

## Wrapper order

```text
pre-LLM emergency gate -> trusted context -> permission/entitlement -> input validation
-> approval when consequential -> idempotency/audit -> domain service
-> safe error or explicit safe-to-model projection -> versioned trusted channel widget
```

No wrapper may reorder authorization behind replay lookup or approval behind the effect.

## Module verification

```powershell
npm test -- tests/agent tests/presentation
npm run eval -- tool-contracts
npm run typecheck
npm run build
npx eve info
```

## Handoff

Module 11 maps these versioned tool/widget events onto Creciendo's authenticated NDJSON channel. The standard Eve channel remains internal/operator-only.
