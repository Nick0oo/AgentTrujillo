# Safety and Emergency Boundary Design

**Date:** 2026-08-16

**Status:** Approved for implementation

**Scope:** Roadmap module 04 on `codex/roadmap-module-04`, based on `origin/main` at `db06ef2`.

## Purpose

Every guardian message must pass a bounded, synchronous, deterministic safety gate before session continuation, retrieval, Eve, Gemini, tools, streaming, persistence of generative content, or workflows. The gate can continue, ask one approved clarification, abstain, recommend a pediatrician, or terminate with immutable emergency-department copy. It never diagnoses, prescribes, selects medicine, or triggers an operational action.

## Constraints and safety boundary

- `AuthorizedChildScope` and module 03 governance are trusted prerequisites; authority is never parsed from the message or model output.
- Colombia is the first active jurisdiction. US fixtures remain separate and synthetic until independently current and clinically approved.
- No real PHI, clinical source body, approval token, physician identity, model prompt, or provider output enters fixtures, logs, evals, or SQL.
- Clinical rule packages in this module are schema- and engine-test fixtures only. They are not production-approved and cannot be activated by this branch.
- Urgent output is one approved localized sentence, byte-for-byte validated, containing only the instruction to go directly to the emergency department. It has no diagnosis, treatment, first aid, medicine, contact, map, link, booking, model text, follow-up, tool, or workflow.
- Supabase Cloud project `yapjiinrjsrothzgzxsv` is the only database target. Do not start Supabase locally, reset a local database, run a local Storage emulator, or use local SQL tests. Synthetic Cloud queries are transactional and end in `rollback`.
- The existing Cloud migration ledger ends at `20260816120000`; AT-04-12 is amended to the forward-only file `20260816130000_safety_evaluation_hardening.sql`.

## Architecture

The `src/safety/` domain is pure and provider-independent. It receives an immutable normalized message plus trusted scope/context, evaluates assertion/measurement/age evidence against a compiled non-executable emergency pack, and returns a closed `SafetyDecision` union. Only the `not_urgent` decision yields a generation permit.

Adapters and persistence live under `src/persistence/supabase/`. They accept redacted evidence only and record idempotent scope, decision, rule codes, algorithm/copy versions, latency, and opaque fingerprints. They never persist raw message text or prompt content. The response policy owns non-urgent clinical boundaries; the preflight caller owns the one-shot permit and is the only integration boundary allowed to proceed to Eve.

## Dependency and parallel execution

```text
AT-03-11 + AT-02-11 -> AT-04-01 -> AT-04-02 -+-> AT-04-03 -+
                                               +-> AT-04-04 -+-> AT-04-06 -+-> AT-04-07 -+
                                               +-> AT-04-05 -+             +-> AT-04-08 -+-> AT-04-10
AT-04-01 + AT-03-11 -------------------------------> AT-04-09 -------------------------+
                                                                                       |
                                                                                       v
AT-04-14 <- AT-04-13 <- AT-04-12 <- AT-04-11 <---------------------------------------+
```

The root agent owns the dependency gate, shared contracts, Cloud migration, generated types, integration, and final verification. After AT-04-02, AT-04-03, AT-04-04, AT-04-05, and AT-04-09 have exclusive paths and can run concurrently. After AT-04-06, AT-04-07 and AT-04-08 can run concurrently. Workers receive one leaf and report evidence; the root agent reviews and integrates.

## Design units

1. **Input contract (AT-04-01):** immutable raw/normalized text, bounded codepoint spans, trusted context, and no authority fields in the model-facing message.
2. **Normalization (AT-04-02):** Spanish Colombia and English US token/span normalization with original text preserved, no translation, no network/model, and bounded segmentation.
3. **Evidence normalization (AT-04-03/04/05):** conservative assertion, measurement, temperature/unit, and age resolution. Negation, quotation, copied instructions, uncertainty, ambiguity, and missing trusted context fail safe.
4. **Rule pack (AT-04-06):** canonical non-executable predicates with strict limits, schema validation, approved-copy key references only, and no diagnosis/treatment/action/URL/regex/eval.
5. **Engine and copy (AT-04-07/08):** pure synchronous bounded evaluation, urgent dominance, deterministic evidence, and byte-for-byte action-free copy validation.
6. **Response policy (AT-04-09/10):** pediatrician recommendation without operations, plus deterministic interception of diagnosis, prescription, medicine, and false-reassurance requests.
7. **Preflight (AT-04-11):** fail-closed one-shot permit before every generation path; no direct provider, Eve, tool, memory, workflow, or Supabase imports.
8. **Persistence (AT-04-12):** Cloud-only idempotent `safety_evaluations` recording with immutable audit fields, owner RLS, no raw content, and recorder failure that cannot alter an urgent response.
9. **Proof (AT-04-13/14):** synthetic deterministic boundary/eval evidence, checklist completion, and residual note for any pre-existing Eve environment failure.

## Verification and handoff

- Focused safety tests, typecheck, build, and module evals run from the new worktree.
- Cloud migration is reviewed, applied with `npx supabase db push --linked --yes`, and checked with a rollback SQL fixture; generated types are refreshed from linked Cloud using the repository atomic writer.
- No local DB command is used. The baseline pre-existing CRLF test failure remains isolated unless the M04 diff independently changes it.
- Each leaf checklist is checked only after its own tests and review evidence exist. `ROADMAP.md` and `docs/verification/safety-emergency.md` receive the final commit chain, Cloud migration checksum, command exit codes, zero-tolerance safety counts, and residual approval/activation limits.

