---
id: AT-04-02
title: Normalize Colombian Spanish and United States English safely
module: 04-safety-and-emergency-boundary
status: completed
execution: sequential
parallel_group: null
depends_on: [AT-04-01]
blocks: [AT-04-03, AT-04-04, AT-04-05]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: high
database_change: false
requires_clinical_approval: false
touches:
  create:
    - src/safety/normalize-message.ts
    - src/safety/tokenize.ts
    - src/safety/lexicons/es-CO.v1.ts
    - src/safety/lexicons/en-US.v1.ts
    - tests/safety/normalize-message.test.ts
  modify: []
  test:
    - tests/safety/normalize-message.test.ts
exclusive_paths:
  - src/safety/normalize-message.ts
  - src/safety/tokenize.ts
  - src/safety/lexicons/es-CO.v1.ts
  - src/safety/lexicons/en-US.v1.ts
  - tests/safety/normalize-message.test.ts
forbidden_paths:
  - .env
  - agent/tools/**
  - supabase/migrations/**
  - supabase/legacy-reference/**
commit:
  message: "feat(safety): normalize bilingual guardian messages"
---

## Outcome

A deterministic, locale-aware normalizer produces reversible tokens/spans for es-CO and en-US without translation, clinical inference, or loss of negation-critical punctuation.

## Why this exists

Colombian caregivers use accents, regional words, abbreviations, voice transcription, and informal units; US caregivers use different forms. Translation/model normalization can erase uncertainty or invent symptoms.

## User and system behavior

The system accepts one declared profile/session locale and can mark mixed-language spans. It preserves original text for evidence, normalizes only search/comparison representations, and returns ambiguity flags rather than guessing.

## Prerequisites

`AT-04-01`; versioned clinical-review lexicons; Node.js 24 `Intl.Segmenter`; synthetic bilingual corpus.

## Mandatory reading

- `roadmap/04-safety-and-emergency-boundary/01-normalized-message-types.md`
- Minsalud/WHO terminology artifacts approved for corpus authoring
- Unicode normalization and `Intl.Segmenter` documentation for Node.js 24

## Scope

Unicode normalization policy, whitespace/control handling, sentence/token segmentation, case-folded comparison form, punctuation preservation, locale-specific abbreviation/variant lexicons, mixed-language marker, original-to-normalized span map, and deterministic limits.

## Out of scope

Translation, spell-correction that changes clinical meaning, symptom classification, negation, unit conversion, age parsing, diagnosis, LLM/NLP service, speech-to-text, or source-text persistence.

## Allowed files

Only listed normalizer/tokenizer/versioned lexicons/tests. Lexicon entries include stable code, variants, locale, review source ID, and semantic-neutral canonical token; no rule threshold.

## Forbidden files and operations

No accent stripping from original, no punctuation deletion before negation, no autocorrect of numbers/units, no external translation API, no model call, no runtime network, no dynamic lexicon fetch, and no arbitrary regex from artifacts.

## Interfaces and types

Export `normalizeMessage(raw, locale)`, `tokenize(normalized)`, `NormalizationWarning`, `LexiconEntry`, and `NormalizationVersion`. Output includes original, Unicode-normalized comparison text, tokens, reversible spans, locale evidence, warnings, and version.

## Technical design

Reject invalid control characters except normalized newline/tab. Normalize comparison text with NFKC while preserving original and maps; lowercase using explicit locale; do not remove diacritics globally. Segment with `Intl.Segmenter` and bounded manual fallback tested identically. Recognize variants as annotations, not substitutions in evidence text. Limit work linearly to message bounds.

## Database and Storage contract

No access. Lexicon version/source IDs later become part of `safety_evaluations` algorithm metadata; raw/normalized content is not stored there.

## Authorization and isolation

Normalization runs only after scope validation and receives no database client. Locale is trusted session metadata; message requests to switch child/country/locale are text. Sibling, foreign-space, revoked, or expired access fails before normalization.

## Clinical safety rules

Normalizer never decides urgency and cannot downgrade a term. Unknown/mixed/ambiguous content adds caution. Urgent output behavior is outside this leaf and remains emergency-department-only with no actions.

## Failure modes

Return `UNSUPPORTED_LOCALE`, `INVALID_TEXT`, `LIMIT_EXCEEDED`, or `NORMALIZATION_AMBIGUOUS`; do not silently translate, truncate, or repair a clinically material number/word.

## Implementation sequence

1. Define normalization version/warnings and lexicon schema.
2. Implement safe Unicode/control/whitespace normalization with mapping.
3. Implement explicit-locale segmentation/case-folding.
4. Add versioned es-CO/en-US neutral lexicons.
5. Add mixed-language and ambiguity annotations.
6. Add golden bilingual/Unicode/property tests.

## Unit and integration tests

Cover accents, ñ, contractions, decimal comma/point preservation, emoji, combining marks, voice punctuation absence, repeated whitespace, abbreviations, mixed language, confusable Unicode, control characters, exact limits, and reversible spans.

## Eve evals and adversarial cases

Prompt injection, copied clinician text, HTML/Markdown, JSON, URLs, tool syntax, and “ignore previous” remain plain untrusted tokens. No content changes instructions or causes a tool call.

## Manual verification

Compare golden es-CO/en-US outputs on Windows and CI runtime, inspect reversible spans character-by-character, and confirm no translation/network dependency.

## Completion evidence

Record corpus version/count, Unicode and locale cases, deterministic snapshots, commands/exits, and commit without real guardian content.

## Commit protocol

Commit exclusive paths with `feat(safety): normalize bilingual guardian messages`; lexicon clinical meaning changes require later approval.

## Completion checklist

- [x] Original text and spans are preserved.
- [x] Normalization is deterministic and bounded.
- [x] Locale behavior is explicit.
- [x] Unknown/mixed text never reduces caution.
- [x] No translation/model/network exists.

## Handoff

Leaves `AT-04-03`, `AT-04-04`, and `AT-04-05` consume tokens/spans in parallel and return annotations without mutating normalized evidence.
