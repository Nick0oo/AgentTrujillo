---
id: AT-06-05
title: Keep vaccine documents OCR and imports as draft evidence
module: 06-immunization
status: completed
execution: parallel
parallel_group: AT-06-P1
depends_on: [AT-06-02]
blocks: [AT-06-06]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: critical
security_risk: critical
database_change: false
requires_clinical_approval: true
touches:
  create:
    - src/clinical/immunization/evidence-policy.ts
    - src/clinical/immunization/administration-draft.ts
    - tests/clinical/immunization/evidence-policy.test.ts
  modify: []
  test:
    - tests/clinical/immunization/evidence-policy.test.ts
exclusive_paths:
  - src/clinical/immunization/evidence-policy.ts
  - src/clinical/immunization/administration-draft.ts
  - tests/clinical/immunization/evidence-policy.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
commit:
  message: "feat(immunization): enforce draft vaccine evidence"
---

## Outcome

Text/chat/document/OCR/import extraction can create only child-scoped draft administration candidates; none count toward a schedule until exact guardian confirmation.

## Why this exists

Vaccine cards contain handwriting, stamps, product abbreviations, multiple children/dates, OCR errors, and incomplete records. Treating extraction as fact can incorrectly mark protection complete.

## User and system behavior

The app displays extracted product/antigens/date/dose/lot/provider/evidence crop with uncertainty and asks the guardian to confirm/edit/reject. Unresolved fields stay draft/review. Schedule ignores all drafts/rejected candidates.

## Prerequisites

`AT-06-02`; private vaccine-document contracts module `09`; guardian confirmation/HITL module `10`; approved draft/uncertainty policy.

## Mandatory reading

- Module `06` README/research baseline
- Baseline administration/document/link DDL
- Module `09` untrusted extraction/privacy roadmap
- Module `10` confirmation/idempotency policy

## Scope

Evidence provenance/trust levels, draft schema, per-field source spans/confidence/alternatives, active-child binding, duplicate source identity, confirmation snapshot/digest, edit/reject/supersede states, schedule-exclusion contract, and tests.

## Out of scope

OCR implementation, document upload, automatic product mapping credit, administration validation/persistence, schedule evaluation, medical-record certification, or provider verification.

## Allowed files

Only listed evidence/draft/tests. Inputs use private document reference and extracted structured fields; raw image/text is not copied to logs/model beyond minimum governed extraction workflow.

## Forbidden files and operations

No auto-confirm, draft schedule credit, model confidence as authority, hidden field correction, cross-child document link, public URL, diagnosis/order, or document/OCR instruction execution.

## Interfaces and types

Export `VaccineEvidence`, `EvidenceField<T>`, `AdministrationDraft`, `DraftDecision`, `createAdministrationDraft(scope,evidence,extraction)`, and `buildAdministrationConfirmationSnapshot`. Each field records declared/extracted source, uncertainty, evidence span/reference, alternatives, and review state.

## Technical design

Treat all extracted content as untrusted data. Bind draft to scope fingerprint, document checksum/page/crop or message ID, extraction model/version, and source digest. Normalize candidates through registry but preserve original. Confirmation snapshot includes every material field and expires; edits create new snapshot/digest. Rejection persists status, not fact credit.

## Database and Storage contract

Draft maps to `vaccine_administrations.confirmation_status='draft'` only after repository implementation; document remains private/link-scoped. Schedule queries require `confirmed`. No Storage access here.

## Authorization and isolation

Evidence document/message must belong to active child/session and guardian has `record`. Sibling/foreign/revoked/expired access returns universal denial. Model cannot submit document/scope IDs.

## Clinical safety rules

Draft/uncertain evidence never certifies administration or immunity. Unknown/contradictory information recommends record/pediatrician/vaccination-service review as text only. Urgent preflight remains first.

## Failure modes

Return invalid/review for missing source checksum, child mismatch, uncertain date/product, conflicting fields, multiple children, altered/expired confirmation snapshot, duplicate evidence, or extraction failure. Never auto-resolve.

## Implementation sequence

1. Define trust/provenance/field/draft states.
2. Bind active-child/document/message evidence.
3. Preserve original plus registry candidates/uncertainty.
4. Build complete expiring confirmation snapshot/digest.
5. Enforce draft/rejected exclusion interface.
6. Add ambiguity/injection/isolation tests and review.

## Unit and integration tests

Cover guardian manual declaration, OCR/import/chat, missing/ambiguous/contradictory fields, multiple products/children, altered crop/checksum, registry ambiguity, edit/reject/confirm snapshot, expiry/replay, sibling/foreign/revoked/expired access, and schedule exclusion.

## Eve evals and adversarial cases

OCR/document text asking to confirm, switch child, ignore uncertainty, or call tools remains data. Model cannot turn confidence into confirmation.

## Manual verification

Review synthetic vaccine-card extraction flow field-by-field; confirm drafts never appear as applied and private evidence never leaks/logs.

## Completion evidence

Record draft/trust/snapshot versions, ambiguity/isolation/injection cases, clinical approval, commands/exits, and commit.

## Commit protocol

Commit exclusive paths with `feat(immunization): enforce draft vaccine evidence`; OCR/storage/tool wiring later.

## Completion checklist

- [x] Every extraction/import remains draft.
- [x] Original/evidence/uncertainty is preserved.
- [x] Confirmation covers every material field.
- [x] Draft/rejected never count.
- [x] Evidence is private and child-bound.

## Handoff

`AT-06-06` validates a confirmed snapshot candidate; `AT-06-12` persists draft/fact/assessment states atomically.
