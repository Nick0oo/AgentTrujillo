# Guardian profile, vaccine declarations and child removal

Prepared 2026-11-03; **not activated in linked Supabase**.

The mobile RLS audit found direct writes that cannot succeed under the protected schema. These commands keep RLS and the identity-write restriction introduced by migration 20261103180000. Each command derives its actor from `auth.uid()`, checks active child permissions and has a server receipt and an idempotency key. Only `authenticated` receives execution; PUBLIC and anon do not.

| Migration | Authorized effect |
| --- | --- |
| 20261103200000 | `update_guardian_child_profile`: atomic name, optional birth dimensions and superseding guardian profile annotations. Name changes additionally require management permission. Private command ledger supports replay. |
| 20261103210000 | `request_child_deletion`: revoke the caller's target-child access. Preserve a child with another active/invited/future tutor; queue exclusive children for staged erasure. Child jobs never disable login or enter account-profile erasure. |
| 20261103220000 | `record_guardian_vaccine_declaration`: preserve explicitly confirmed date, label, place, lot and notes as guardian/draft with verification pending. No product, antigen links, assessment, clinical validity or validated-dose credit. |

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

The networkless PostgreSQL fixture passes authenticated profile atomicity/replay/conflict, vaccine declarations and foreign denial, sole/shared child removal, bounded completion, preservation of another child's audit, later account deletion, onboarding/siblings and existing account-erasure/holds/RLS tests. Worker tests prove child jobs skip Auth deletion. Native Android acceptance, linked rehearsal/application, generated linked types and production worker deployment remain open.
