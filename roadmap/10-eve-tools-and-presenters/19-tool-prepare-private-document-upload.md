---
id: AT-10-19
title: Prepare a private document upload
module: 10-eve-tools-and-presenters
status: completed
execution: parallel
parallel_group: eve-tools
depends_on: [AT-10-07, AT-09-19, AT-10-03]
blocks: [AT-10-26]
worker:
  model: gpt-5.6-luna
  reasoning: max
clinical_risk: high
security_risk: critical
database_change: false
requires_clinical_approval: false
touches:
  create:
    - agent/tools/prepare_private_document_upload.ts
    - tests/agent/tools/prepare-private-document-upload.test.ts
  modify: []
  test:
    - tests/agent/tools/prepare-private-document-upload.test.ts
exclusive_paths:
  - agent/tools/prepare_private_document_upload.ts
  - tests/agent/tools/prepare-private-document-upload.test.ts
forbidden_paths:
  - .env
  - supabase/migrations/**
  - agent/tools/evaluate-red-flags.ts
  - agent/tools/trigger-red-flag-alert.ts
commit:
  message: "feat(tool): prepare a private document upload"
---

## Outcome

A mutating Eve tool validates declared metadata and, after explicit confirmation, returns a mobile-directed one-purpose private upload event while withholding signed URL from model context.

## Why this exists

Eve exposes capabilities directly to a probabilistic model and streams results to a pediatric mobile client. Authority, clinical truth, effects, confirmation, safe output, and presentation must therefore be structural and individually testable.

## User and system behavior

The active guardian receives one bounded, accessible, child-specific operation or result. Unauthorized, unavailable, ambiguous, or unsafe cases fail closed; urgent input is intercepted synchronously before the LLM and tools.

## Prerequisites

AT-10-07, AT-09-19, AT-10-03 and the exact Eve 0.27.13/AI SDK/domain contracts named below.

## Mandatory reading

- Module 10 README and direct prerequisite leaves
- Root AGENTS clinical/tool/channel rules
- Installed Eve 0.27.13 skill/tool/channel documentation and AI SDK schemas
- Modules 02–09 domain authorization, governance, safety, persistence, and eval evidence

## Scope

A mutating Eve tool validates declared metadata and, after explicit confirmation, returns a mobile-directed one-purpose private upload event while withholding signed URL from model context. The leaf owns its exact schema, method, dependency injection, policy order, safe result/event, tests, and completion evidence.

## Out of scope

Unlisted tools, red-flag tool calling, shell/filesystem/arbitrary network/delegation, diagnosis, prescription, clinician operations, mobile implementation, schema migration, deployment, and urgent actions beyond emergency recommendation.

## Allowed files

Only frontmatter paths. Reuse domain services through typed ports; do not duplicate clinical arithmetic/rules or edit neighboring tool/presenter files.

## Forbidden files and operations

Never read .env, mutate Supabase/remote state outside an explicitly authorized domain service, accept model authority, log PHI/prompts/reasoning/secrets/tickets, expose internal Eve routes, or add evaluate/trigger-red-flag as a tool.

## Interfaces and types

Schema accepts purpose/display name/MIME/size/checksum intent/consent/idempotency, never bucket/path/child; handler executePreparePrivateDocumentUpload.

## Technical design

Authorize manage_documents, metadata policy, preview/approval, opaque reservation, short upload ticket, then split safe model result from trusted channel event carrying ephemeral URL/headers. Audit stores digest only.

## Database and Storage contract

No schema change. Tools call the already verified domain repositories/services and their atomic idempotency transactions; presenters are pure. Storage tickets travel only in trusted channel events, never tool-to-model output.

## Authorization and isolation

Resolve TrustedToolContext first, revalidate permission/active child/session before effects and replays, and derive care space, child, guardian, country, package, entitlement, and confirmation truth server-side. Negative tests cover sibling, tenant, revoked, stale session, and forged fields.

## Clinical safety rules

No public URL, model-visible signed token, unscanned clinical use, or automatic extraction confirmation.

## Failure modes

Map validation, forbidden, confirmation, idempotency, package/rule, provider, persistence, cancellation, and unknown failures through SafeToolError. No stack/identifier enumeration, unsafe retry, partial success claim, or model fallback is allowed.

## Implementation sequence

1. Verify Eve discovery/schema convention and prerequisite service contract.
2. Define exact Zod input/result/event schemas with no authority fields.
3. Apply preflight, context, permission, approval/idempotency/audit order as applicable.
4. Invoke one domain capability and project explicit safe output.
5. Add presenter/widget or safe failure behavior and adversarial tests.
6. Verify discovery/evidence and commit exclusive paths.

## Unit and integration tests

Cover path/MIME spoof, preview drift, replay ticket semantics, cancellation, provider failure, URL leak, entitlement/revocation and sibling scope; additionally unknown fields, forged authority, revoked access, cancellation, deterministic serialization, safe errors/output, and zero unintended effect.

## Eve evals and adversarial cases

Attempt prompt/schema injection, child/country/package/entitlement override, tool chaining around approval, replay duplication, diagnosis/prescription, PHI leakage, clinician booking/handoff, and emergency extras. Critical cases require 100% pass.

## Manual verification

Inspect Eve discovery and one real synthetic invocation/event stream for allowed, denied, confirmation, replay, failure, and cancellation paths; validate mobile-facing accessibility and exact clinical wording where applicable.

## Completion evidence

Recorded by the Luna/max implementer and root reviewer on 2026-08-23:

- Outcome: added model-callable `prepare_private_document_upload` with strict `prepare-private-document-upload.v1` declared-metadata input, `prepare_private_document_upload.trusted.v1` trusted result, `private.document-upload.v1` mobile event, and separate `prepare_private_document_upload.model.v1` projection. The tool reserves through the verified request-scoped M09 service only after explicit approval and never accepts bucket, object path, child/care-space/guardian/country authority, ticket, URL, header or approval-token fields from the model.
- Policy/effect order: outer active-scope and permission reauthorization precedes approval consumption; the wrapper then performs strict validation, digest-bound guardian approval and derived idempotency; the handler reauthorizes immediately before the domain call and after the possible effect before exposing the ticket. Cancellation after issuance attempts the M09 typed `cancel` operation best-effort and still reports the effect as unknown; an already-issued provider URL is not falsely claimed revoked before its bounded TTL.
- Approval/idempotency: effect is `draft`; the service receives only `prepare_private_document_upload:<sha256>` derived from trusted product-session/tool-call identity. The model's opaque client key participates in approval/request binding but is never used as repository authority. M09 intentionally returns `IDEMPOTENCY_CONFLICT` for reservation replay because it has no safe fresh-URL reissue operation; the tool neither reuses a stale URL nor mints a second capability.
- Trusted/model separation: the strict guardian event carries the one-purpose HTTPS ticket, exact no-upsert headers, checksum, MIME, size and maximum five-minute expiry. Model output contains only `upload_prepared`, allowlisted purpose and `mobileActionRequired: true`; audit contains digests/status only. Ticket URLs, query tokens, headers, paths, bucket and document identifiers were absent from model and audit serialization.
- Implementation commit: `7ac468271f84d08b7b6367fe6192ec9cc8e0896d` (`feat(tool): prepare a private document upload`). Changed paths were exactly `agent/tools/prepare_private_document_upload.ts` and `tests/agent/tools/prepare-private-document-upload.test.ts`.
- TDD/worker evidence: the initial missing-module RED exited `1`; the Luna/max worker delivered `13/13` focused tests, `6/6` M09 service tests, `106/106` selected runtime tests and isolated strict typecheck at exit `0`, without staging, committing, editing roadmap or invoking any real provider.
- Root review correction: a new cancellation-cleanup assertion first failed at exit `1` with `12` passing and `1` failing test because an issued reservation was not cancelled. The root added the existing typed M09 `cancel` seam and best-effort cleanup for cancellation, post-effect authorization denial and invalid ticket projection; the corrected focused suite passed `13/13`.
- Fresh root verification: focused tool plus M09 upload-ticket service passed `2` files/`19` tests; approval, idempotency, audit, safe-error, safe-projection, permission and trusted-context suites passed `7` files/`138` tests. `npm run typecheck`, `npm run build`, `git diff --cached --check` and all listed commands exited `0`.
- Fresh Eve checkpoint: Eve `0.27.13` reported compile ready, `0` errors, `0` warnings, exactly `13` tools, `0` subagents and `0` schedules. The legacy Module 01 zero-tool fixture remains a transparent AT-10-33 integration correction; this leaf does not claim that legacy verifier passed.
- Negative/security matrix: forged authority/storage/ticket fields, unsafe filename/URL/userinfo/header/upsert/MIME/checksum/TTL, missing permission, foreign country, expired scope, approval drift, current-ticket expiry, provider/policy/authorization failure, post-issue revocation, cancellation and reservation replay all failed closed. Staged ownership was exact; forbidden-path, artifact, credential and PHI/prompt/reasoning scans reported zero findings.
- Clinical/safety review: the upload is not a confirmed clinical fact and cannot bypass scan, extraction-draft or confirmation boundaries. No diagnosis, prescription, clinical rule/copy, clinician action, urgent workflow or personal approval/signature was added; this leaf does not require clinical approval.
- Cloud/database: `database_change: false`; no migration, schema edit, direct/generic write, real upload, Storage call, Supabase data mutation, deployment or remote effect occurred. The verified M09 evidence still records that the installed raw Storage provider's two-hour signed-upload URL is rejected; production issuance requires an approved provider/gateway that proves a maximum five-minute capability.
- Handoff: closing the last pending tool dependency makes AT-10-26 eligible once selected under the sequential presenter rule. Module 11 can later transport only the trusted versioned event and must keep the signed ticket out of model/log streams; Module 12 replay must preserve M09 conflict semantics and never duplicate a capability.

## Commit protocol

Commit exclusive paths with feat(tool): prepare a private document upload; no remote deployment, unrelated changes, or undocumented discovery entry.

## Completion checklist

- [x] Model schemas contain no authority or clinical-result claims.
- [x] Policy order and effects are deterministic and tested.
- [x] Tool-to-model output is explicit and privacy-safe.
- [x] No diagnosis, prescription, clinician operation, or urgent extra exists.
- [x] Eve discovery contains exactly the intended surface.

## Handoff

Only frontmatter blocks IDs become ready after fresh tests, evidence, review, and commit.
