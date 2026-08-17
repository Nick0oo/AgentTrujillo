# Module 04 — Safety and Emergency Boundary

This module creates the synchronous deterministic gate that evaluates every guardian message before Eve or Gemini receives it. It can continue, request one bounded clarification, abstain, recommend pediatrician review, or terminate with immutable emergency-department copy. It never diagnoses and never triggers an operational action.

## Current implementation status

The branch implements all fourteen deterministic contracts, synthetic boundary fixtures, and the Cloud-only redacted persistence migration. User approval is recorded for the implemented safety behavior; leaves that still require production artifacts, channel wiring, or runtime evidence remain in `review`. No real Colombia/US package or urgent copy is activated. Strict Eve evals are authored and discoverable, but the current runtime environment reports `ENV_INVALID` before execution.

## Entry gate

- Module `03` governance is implemented and its eval gate passes.
- One approved emergency package exists for the active jurisdiction or the system uses the separately approved fail-closed minimum behavior.
- `AuthorizedChildScope` provides trusted child age context, country of care, locale, timezone, and lease version.
- Research baseline: [pediatric safety source baseline](../../docs/research/2026-08-16-pediatric-safety-source-baseline.md).
- Colombia activates first. United States content is separate and remains unavailable until independently current, approved, and evaluated.

## Absolute urgent-output contract

An urgent decision ends the turn before Eve/LLM execution and emits one localized approved sentence whose only instruction is to go directly to the emergency department. It contains no:

- diagnosis, differential diagnosis, probability, reassurance, treatment, first aid, medicine, dose, feeding plan, or monitoring plan;
- alarm, notification, SMS, email, phone number, call, contact, handoff, case, clinician escalation, or Dr. Trujillo message;
- map, address, distance, location lookup, link, button, booking, appointment, schedule, or navigation action;
- model-generated text, explanation, follow-up question, tool call, generative widget, or background workflow.

The internal audit may record versioned rule codes; the guardian output does not expose a diagnosis or disease label.

## Exit gate

All fourteen leaves are complete and fresh evidence proves:

- Spanish (Colombia) and English (US) normalization preserves original text and spans;
- negation, quotation, subject, temporality, uncertainty, and copied instructions cannot silently become current child symptoms;
- temperatures, units, age expressions, corrected age, and reference instants are deterministic and ambiguity-safe;
- only approved canonical emergency packages load;
- `SafetyDecision` is deterministic, pure, synchronous, bounded, and provider-independent;
- urgent copy conforms byte-for-byte to the approved action-free schema;
- non-urgent professional review only recommends a pediatrician and creates no professional workflow;
- diagnosis, prescription, medicine-selection, and false-reassurance requests are intercepted by response policy;
- safety preflight runs before session continuation, retrieval, Eve, Gemini, tools, streaming, persistence of generative content, or workflows;
- `safety_evaluations` persists scope and rule evidence idempotently without raw message content;
- critical false negatives, urgent-output violations, and model/provider bypasses are zero.

## Decision contract

```ts
type SafetyDecision =
  | { decision: "urgent"; responseMode: "emergency_recommendation"; ruleCodes: readonly string[]; copyKey: ApprovedEmergencyCopyKey }
  | { decision: "clarification_required"; responseMode: "clarify"; question: ApprovedClarification }
  | { decision: "professional_review"; responseMode: "pediatrician_recommendation"; reasonCode: string }
  | { decision: "not_urgent"; responseMode: "continue" }
  | { decision: "indeterminate"; responseMode: "abstain"; reasonCode: string };
```

Only `not_urgent` may enter the generative path. A clarification returns a deterministic question and reruns preflight on the next message.

## Dependency graph

```text
AT-03-11 + AT-02-16 -> AT-04-01 -> AT-04-02 -+-> AT-04-03 -+
                                               +-> AT-04-04 -+-> AT-04-06 -+-> AT-04-07 -+
                                               +-> AT-04-05 -+             +-> AT-04-08 -+-> AT-04-10
AT-04-01 + AT-03-11 -------------------------------> AT-04-09 -------------------------+
                                                                                       |
                                                                                       v
AT-04-14 <- AT-04-13 <- AT-04-12 <- AT-04-11 <---------------------------------------+
```

Normalization leaves `03`, `04`, and `05` may execute in parallel after `02`. Engine and copy leaves `07` and `08` may execute in parallel after the pack contract. Shared paths remain exclusively owned.

## Work-unit index

| ID | Outcome | Clinical approval | Depends on |
|---|---|---:|---|
| [AT-04-01](01-normalized-message-types.md) | Define safety input types | no | `AT-03-11`, `AT-02-16` |
| [AT-04-02](02-spanish-and-english-normalization.md) | Normalize es-CO/en-US text without translation | no | `AT-04-01` |
| [AT-04-03](03-negation-and-quotation-detection.md) | Classify assertion context | yes | `AT-04-02` |
| [AT-04-04](04-temperature-and-unit-normalization.md) | Normalize temperature/units conservatively | yes | `AT-04-02` |
| [AT-04-05](05-age-expression-normalization.md) | Resolve age expressions against trusted DOB | yes | `AT-04-02` |
| [AT-04-06](06-red-flag-rule-pack.md) | Define approved emergency rule package | yes | `AT-04-03`, `AT-04-04`, `AT-04-05` |
| [AT-04-07](07-deterministic-red-flag-engine.md) | Evaluate emergency rules synchronously | yes | `AT-04-06` |
| [AT-04-08](08-approved-emergency-copy.md) | Enforce immutable action-free urgent copy | yes | `AT-04-06` |
| [AT-04-09](09-professional-recommendation-policy.md) | Recommend pediatrician without operations | yes | `AT-04-01`, `AT-03-11` |
| [AT-04-10](10-clinical-response-policy.md) | Enforce diagnosis/prescription boundaries | yes | `AT-04-08`, `AT-04-09` |
| [AT-04-11](11-pre-llm-safety-preflight.md) | Gate every turn before Eve/Gemini | yes | `AT-04-07`, `AT-04-10` |
| [AT-04-12](12-safety-evaluation-persistence.md) | Persist decisions idempotently | no | `AT-04-11` |
| [AT-04-13](13-red-flag-boundary-evals.md) | Prove emergency boundary coverage | no | `AT-04-12` |
| [AT-04-14](14-diagnosis-and-prescription-abstention-evals.md) | Prove prohibited clinical behavior is absent | no | `AT-04-13` |

## Tool and runtime rule

Red-flag evaluation is not an Eve tool. There is no `trigger_red_flag_alert`, `evaluate_red_flags`, or model-callable equivalent. It is an application precondition executed synchronously by the channel before a session turn. Urgent results do not enter Eve at all.

## Module verification

```powershell
npm test -- tests/safety
npx eve eval safety/red-flags safety/clinical-boundaries --strict --max-concurrency 1 --skip-report
npx supabase db query --linked --file supabase/tests/023_safety_evaluation_persistence.test.sql
npm run typecheck
npm run build
```

Database verification uses the linked Supabase Cloud project only. No local Supabase start/reset, local SQL test, or Storage emulator is part of this module's evidence.

Evidence stores synthetic text or corpus case IDs only. Real messages, child identity, prompts, provider output, and approval notes remain absent.

## Handoff

Module `11` must call `SafetyPreflight.evaluate` before every new/continued turn. Modules `05`–`10` reuse approved response policy but cannot change emergency behavior.
