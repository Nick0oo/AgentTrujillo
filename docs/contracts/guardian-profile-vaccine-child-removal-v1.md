# Guardian profile, vaccine declarations and child removal

Activated and verified in linked Supabase on 2026-11-03; native QA is in progress.

The mobile RLS audit found direct writes that cannot succeed under the protected schema. These commands keep RLS and the identity-write restriction introduced by migration 20261103180000. Each command derives its actor from `auth.uid()`, checks active child permissions and has a server receipt and an idempotency key. Only `authenticated` receives execution; PUBLIC and anon do not.

| Migration | Authorized effect |
| --- | --- |
| 20261103200000 | `update_guardian_child_profile`: atomic name, optional birth dimensions and superseding guardian profile annotations. Name changes additionally require management permission. Private command ledger supports replay. |
| 20261103210000 | `request_child_deletion`: revoke the caller's target-child access. Preserve a child with another active/invited/future tutor; queue exclusive children for staged erasure. Child jobs never disable login or enter account-profile erasure. |
| 20261103220000 | `record_guardian_vaccine_declaration`: preserve explicitly confirmed date, label, place, lot and notes as guardian/draft with verification pending. No product, antigen links, assessment, clinical validity or validated-dose credit. |
| 20261103230000 | Reconcile the missing canonical source-note column and guarded capture wrapper after an authenticated synthetic write returned PGRST202. Explicitly authorized separately by the user. |
| 20261103231000 | Routine forward correction found during verification: the shared immutability trigger uses schema/table-scoped JSON field access so other history relations lacking source_note keep the intended 42501 denial. No grants or clinical values change. |

Child jobs reuse the existing global dispatch clock (one job/batch per hour), 100-row maximum, leases, archive fencing and erasure acknowledgements, Storage API acknowledgement and retention holds. There is no extra scheduler or LLM call. Other children and their audit records remain intact. Legacy account jobs default to `kind=account`.

## Deployment sequence

1. Obtain explicit approval for these three migrations, the worker deployment and a newly created disposable synthetic fixture. Existing accounts/children are excluded from deletion QA.
2. Deploy the backward-compatible worker before enabling child-job admission. Verify one replica and the existing persistent Workflow directory; preserve signing, secrets, routing and clinical packages.
3. Pin CreciendoApp (`yapjiinrjsrothzgzxsv`), compare migration head and policy digest, rehearse the complete migration plus synthetic SQL assertions inside a transaction ending in ROLLBACK, and verify rollback.
4. Apply the three forward migrations atomically, record history and reload PostgREST. Verify authenticated/anonymous grants, all public RLS guards, unchanged read policies and absence of generic identity DML.
5. Generate public database types through the official generator, check parity and lint the new/replaced functions. Run authenticated API and disposable fixture acceptance, then install a clearly identified Android QA build preserving its session. Do not submit a public store version.

## Failure handling

Before transaction commit, roll back the complete schema rehearsal/application on any failed assertion. After activation, suspend execution of the three new entry points if a serious regression occurs, preserve queues and evidence and prepare a reviewed forward repair. Never disable RLS, restore unrestricted INSERT policies or pretend completed erasure can be undone. Deploying the older strict worker after migration would stop job processing; do not roll it back while `kind` is returned.

## Evidence and remaining gates

The networkless PostgreSQL fixture passes authenticated profile atomicity/replay/conflict, vaccine declarations and foreign denial, sole/shared child removal, bounded completion, preservation of another child's audit, later account deletion, onboarding/siblings and existing account-erasure/holds/RLS tests. The note regression reproduces missing-contract and shared-trigger failures, then proves capture/replay, exact lexemes, overwrite/clinical-mutation/foreign denial. Linked rollback rehearsals passed before application; final SQL lint has zero findings. All 72 RLS/pending guards remain, direct identity DML stays denied and the SELECT digest is unchanged.

PR #21 merged at 5288e1e62458edd25327e55c1d78c48e8295df55; main CI/container/deployment run 41702541606 succeeded before admitting child jobs. Official public types generated twice match SHA-256 4056ebb895e9a6b0495db60460f324e31ab363079f081c6b10f7e57f598ce749. Hosted disposable acceptance verifies profile persistence/replay, vaccine pending data/replay, milestone toggle/tombstone, growth write/history/chart; child erasure completes in seven batches without an Auth call and preserves account/second-child access. Account cleanup then completes in seven batches with no existing accounts touched and no hourly-clock change. Internal archive/storage safety remains covered by the unchanged engine's existing tests; this new fixture deliberately contains no archive roots or objects.

Physical Android initially could reach Supabase while the backend domain timed out, also from a separate system HTTPS probe. Changing the phone's network made both reachable; the same QA code now loads, saves a synthetic measurement and renders an observed point/evaluation. Three warm Home/Crecer trips retain that point with loading=false/error=false. Do not attribute the network failure to RLS or claim the temporary QA artifact is a new store release. Final clean native QA and source-reconciliation PR remain in progress.
