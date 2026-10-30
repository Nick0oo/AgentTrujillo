# Account deletion and onboarding amendment — 2026-10-29

## Onboarding birth metadata

`onboarding.v1` and `add-child.v1` accept optional `child.birthLengthCm` and
`child.birthHeadCircumferenceCm`: finite positive decimal numbers in cm, at most
two decimal places, bounded by the database's numeric(5,2) representation.
These are guardian-confirmed birth metadata, not a time-stamped anthropometry
measurement or a clinical assessment. Missing fields remain absent so existing
idempotency fingerprints and original RPC signatures remain compatible.
New atomic wrapper RPCs persist both fields in the same transaction as registration;
replayed dimensions cannot overwrite a previously registered child.
The private registration journal preserves the original dimensions independently
of later edits. Confirmed profile edits use `update_registered_birth_measurements`,
which checks current record permission and updates only absolute birth grams/cm.
Editing the profile does not invalidate a retry of the original registration.

## Self-service request

`POST /creciendo/v1/account/deletion`, authenticated bearer, required
`Idempotency-Key`, strict body `{ "version":"account-deletion.v1", "confirmed":true }`.
No guardian, child or space authority is accepted in the body. The SQL request
uses `auth.uid()` and returns HTTP 202 with the strict receipt:

```json
{"version":"account-deletion.v1","status":"queued","requestId":"00000000-0000-4000-8000-000000000001","accessRevoked":true}
```

`accessRevoked` means product access is revoked in the request transaction:
memberships/child grants, active product sessions, guardian devices and exclusive
child reminders. A restrictive RLS policy also blocks reads/writes with an
unexpired JWT, including Storage; write triggers defend SECURITY DEFINER paths.
Existing signed object URLs expire on their existing short lifetime. The deletion
route verifies the bearer but does not require a readable profile, allowing a lost
receipt to be recovered by the same subject. The job is unique per subject, even
if a retry supplies a new idempotency key.

The app clears the matching guardian's local state only after validating this
receipt. Failure preserves the session for retry. Its confirmation describes a
queued staged erasure, not completed destruction of all copies.

## Hourly bounded processing

Eve 0.27.13 `agent/schedules/account-deletion.ts` is a handler schedule (`run`),
not an LLM prompt. Each invocation claims one due job with `FOR UPDATE SKIP LOCKED`,
a five-minute opaque lease and one batch. The job survives server restarts.
A private UTC-hour slot limits dispatch across server replicas and retries as
well as the individual job leases, avoiding a multiplied per-replica budget.
The order is access, chats, exclusive child records/files, profile cleanup.
The maximum per invocation is 100 data rows or 100 physical Storage objects;
control-plane manifest/lease writes are additional small bounded operations.
Progress waits at least one hour; failures back off six hours and explicit holds
one day. Jobs with another active lease cannot be processed concurrently.

The initial worker stage invokes the server-only Supabase Auth soft-erasure API,
which retains the opaque auth/profile FK key where another guardian's records
require it. The upstream implementation obfuscates contact identifiers, clears
metadata and credentials, erases factors/identities and logs out auth sessions:
[Auth admin handler](https://github.com/supabase/auth/blob/master/internal/api/admin.go),
[Auth user soft erasure](https://github.com/supabase/auth/blob/master/internal/models/user.go).
This needs a synthetic preview Auth verification on the linked service version;
the local SQL fixture deliberately does not claim to test hosted GoTrue.

The child set is selected on the server from current access and frozen while
grants are serialized; active shared children are preserved. New grants to a
pending exclusive child or pending actor are denied. Shared clinical facts from
another guardian are not erased. Confirmed child memory and its confirmation
evidence are unlinked from the erased chat, with only source references removed;
they remain for a shared child and are deleted in the later exclusive-child
stage where applicable. Unconfirmed chat candidates/artifacts follow their own
session FK scope. Unresolved foreign-key dependencies cause a retry, not completion.

The eraser derives trusted table/column identifiers from the catalog, keeps all
FK constraint triggers enabled and checks incoming FK rows before a parent
DELETE, preventing a large hidden cascade. The owner function temporarily
disables only previously enabled USER triggers inside the same transaction to
permit erasure of append-only data; it restores them before commit and rolls back
on error. Short lock/statement limits prevent a stalled cleanup from monopolizing
the database. The functions are service-role-only; guardians cannot select jobs,
claim leases, select manifest paths, or operate a batch.

Files are removed with the Storage API before metadata is erased. The manifest
and per-object acknowledgement allow retries after partial provider failures.
Explicit document and clinical-memory holds pause the relevant deletion stage.
Financial quantities and minimal operational audit evidence remain, with erased
child/actor links and metadata detached in bounded batches. Profiles retaining
referential keys become `Cuenta eliminada`; empty unshared spaces are closed.
Cloud backups and provider retention are not represented as instant erasure.

## Eve durable chat archive erasure

Eve 0.27.13 bundles LocalWorld 5.0.0-beta.31, distinct from the top-level Workflow
dependency. The private `@creciendo/workflow-world-local` package uses that exact
factory. Its reserved native `$rootRunId`/`$parentRunId` and `$eve.root`/`$eve.parent`
attributes identify the complete conversation tree; controlled legacy argument
paths and trusted replay metadata cover older turn records. User text, titles
and arbitrary string matches never supply ownership.

The initial worker cancels and fences runtime writes before erasing SQL chats.
After SQL chat cleanup, a separate `archive` stage erases at most 100 persistent
artifacts per invocation: steps, events, streams, hooks and their indexes/claims.
Ten minutes of quiescence and a second lineage scan precede erasure. Strict
containment, no symlinks, the exact storage version and exclusive stream ownership
are required. A shared stream namespace or unknown layout fails closed.

The configured World serializes mutations against the erasure barrier and rejects
late stream/event/attribute/queue writes and replay-created descendants. Persistent
fences and minimal cancelled run tombstones contain only opaque runtime identity,
lineage and lifecycle metadata; no input/output/error, title or conversation body
remains. They prevent a resilient-start envelope from rebuilding erased content.
This adapter supports the existing single-process, single-node local-World host;
the production topology must be checked before activation.

Service-role-only archive scope/ack RPCs bind fencing and erasure receipts to an
active job lease. SQL cannot advance past the archive stage, erase child data or
mark a job completed without that receipt. Guardians cannot acknowledge erasure.
Actual hosted Auth/Storage verification and linked deployment approval remain
release gates; no supplied account is deleted to test this feature.

## Local verification and linked impact

`scripts/diagnostics/local-account-lifecycle-tests.mjs` refuses any container except
the named, labeled, networkless synthetic fixture. It loads the forward migrations
and runs transaction/rollback assertions. Vector is a fixture-only array domain;
vector clinical calculations/index behavior are outside this test.
Reproduce with `node scripts/diagnostics/local-account-lifecycle-tests.mjs
--create-fixture --cleanup-fixture` (one command). It creates only the isolated
fixture when absent and removes that exact verified container ID on success.
SQL tests cover atomic birth persistence/replay/rollback; revoked RLS access;
worker grants and leases; shared-child and other-guardian session preservation;
105 messages and 105 immutable measurements erased with a one-row cap; private
avatar/document manifest acknowledgement; document retention holds; minimized
audit/billing records; and false archive completion denial.

New linked migrations are `20261029210000` and `20261029220000`. The user-approved
activation succeeded after dry-run/verified rollback and isolated SQL assertions.
Linked postflight confirms restrictive pending-account policies on all public
RLS tables, guardian denial of worker/ack/private queue access, and authenticated
self-service access only. Function lint reports no findings. Both generated type
files are byte-exact to two successive official Cloud generations (SHA-256
f9b31f0ae77b0cf207cdc6c487e6c315de860b52be8ecb82f43816fa10a8fc4f).
The byte-exact `20261029190000` baseline correction is reconciled
from the already-applied original checkout; do not reapply or rewrite it.
The already-approved/applied `20261029200000` published privacy definition is
likewise reconciled byte-for-byte; it inserts no account consent.
Do not enable a mobile release that submits the new fields or deletion endpoint
before its backend is available. No real or supplied QA account is deleted.
Preview Auth/Storage verification, generated schema types/parity/lint, linked migration review and
explicit deployment authority remain release gates. Rollback means stopping the
schedule/reverting application exposure; completed erasures are not reversible.

Current local evidence: backend build and exact Eve discovery pass with zero
diagnostics, the two intended schedules and no forbidden runtime tools. The
generated Node entry registers the hourly schedule and calls Nitro's
`startScheduleRunner({ waitUntil: server.waitUntil })`; this verifies container
entry wiring, not a production execution. Backend full suite: 212 suites/1,881
passed, one pre-existing skipped case; Workflow integration 1/1 passes.
The actual bundled World tests prove two-account isolation, one-artifact
batches, replay fencing, in-flight write fencing and symlink/shared-stream
rejection. Staged runtime packaging loads the exact private adapter and starts
the compiled HTTP server successfully. Mobile: 289 suites/964 tests passed; TypeScript
passes in both repositories. Expo lint has zero errors and existing warnings;
native-only/routes/scope checks pass. SQL assertions include retained chat-memory
and document holds, physical-object acknowledgement ordering, and a global
hourly claim budget with a second due job. Linked preflight confirmed the expected
project, Auth health 200 (v2.197.0) and the existing registration/policy migrations.
The two authorized new schema migrations are now applied; no existing account
or clinical data has been deleted. The Linux Docker image builds and its
networkless production health/auth smoke passes. Read-only Dokploy inspection
confirms one replica and the expected persistent volume and mount path.

Release candidates 1.0.0 (14) are building on EAS: Android
89a532ee-657a-408a-9959-080247f06d38 and iOS
22d14ee3-58b9-41aa-890c-e801d99b5740. Do not install/distribute until the backend
activation and native artifact checks pass. The supplied QA account is never
an erasure fixture; hosted end-to-end deletion verification requires a new,
explicitly disposable synthetic account and separate authority.
