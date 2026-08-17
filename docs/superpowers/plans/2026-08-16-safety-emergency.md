# Safety and Emergency Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for the independent leaves below. One worker owns one leaf and its exclusive paths; the root agent reviews every report before dependent work proceeds.

**Goal:** Implement all fourteen module 04 leaves so every message is deterministically gated before generative execution, urgent output is immutable and action-free, non-urgent clinical boundaries are enforced, and safety evidence is persisted idempotently in Supabase Cloud without raw content.

**Branch/worktree:** `codex/roadmap-module-04` in `.worktrees/module-04-safety-emergency`, based on `origin/main` `db06ef2`.

**Cloud rule:** Use linked Supabase Cloud only. Do not run `supabase start`, `supabase db reset`, local SQL tests, or Storage emulators. Apply the amended migration `20260816130000_safety_evaluation_hardening.sql` with `npx supabase db push --linked --yes`; run synthetic SQL through `npx supabase db query --linked --file ...` and end it with `rollback`.

## Global invariants

- Only `not_urgent` may enter Eve/Gemini.
- Urgent copy is approved, localized, byte-for-byte validated, and contains no operational action or model text.
- Ambiguous or incomplete evidence never becomes an absent symptom or a safe continuation.
- Rule packs are non-executable and synthetic in this module; no real approval or activation is performed.
- No raw message, prompt, child identity, approval note, source body, or provider output is persisted or exported.
- The preflight path is synchronous, bounded, provider-independent, and fails closed.

## Execution sequence

1. Root confirms baseline, reads every leaf contract and Eve docs, and records the existing test failure.
2. Root implements/reviews AT-04-01 and AT-04-02, including shared contracts and normalization.
3. Dispatch AT-04-03, AT-04-04, AT-04-05, and AT-04-09 concurrently; each worker uses exclusive paths and synthetic fixtures only.
4. Root reviews P1 reports, then implement/review AT-04-06.
5. Dispatch AT-04-07 and AT-04-08 concurrently; review both against the shared pack contract.
6. Implement AT-04-10 and AT-04-11 in dependency order, keeping integration at the caller boundary.
7. Implement and review AT-04-12, apply the Cloud migration forward-only, refresh generated types, and run its rollback SQL fixture.
8. Implement AT-04-13 and AT-04-14, run all deterministic suites and evals, update checklists/evidence, and perform a whole-branch review.

## Leaf acceptance

Each leaf must include its declared tests, `npm run typecheck` when source changes, staged-path ownership review, `git diff --cached --check`, and the exact roadmap commit message. The root agent will not mark a checklist complete from a worker claim alone.

## Final verification

Run focused safety tests, the relevant full suite, `npm run typecheck`, `npm run build`, `npm run eval -- red-flags`, `npm run eval -- clinical-boundaries` (or the repository's configured equivalent), Cloud migration/query evidence, forbidden import scans, secret scans, and `git status --short --branch`. Preserve the known baseline CRLF failure if it remains unrelated and document it explicitly.

