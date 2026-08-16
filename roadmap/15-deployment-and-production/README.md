# Module 15 — Deployment and Production

This module turns the exact Agent Trujillo release candidate into an operationally safe, reversible, market-specific production decision. It does not itself authorize or perform remote deployment.

## Entry gate

- Module 14 provides a signed release evidence bundle for an immutable commit/artifact.
- All domain/tool/channel/workflow/commerce/model contracts are implemented and freshly verified before their runbooks can complete.
- The environment matrix keeps preview/test completely separate from production and keeps US production disabled by default.
- Production mutations require an explicit release decision and separate execution authority.

## Exit gate

All twenty-one leaves prove isolated environments, pinned Vercel topology, an immutable preview pipeline, deployed smoke coverage, secret and supply-chain gates, migration/restore readiness, executable incident/replay/privacy/clinical-package runbooks, sole new-agent ingress, rehearsed rollback, controlled Colombia rollout, independent US activation gating, and a signed go/no-go packet with zero critical clinical, isolation, security, or privacy failures.

## Dependency strategy

Leaves 01–08 establish environment, deploy, smoke, secret, migration, restore, and repository-security evidence. Runbooks 09–16 may execute in parallel after their prerequisites. Legacy cutover 19 and rollback 20 close the operational graph. Colombia rollout 17 depends on rollback and cutover; US activation 18 is an independent later market gate. Final readiness 21 consumes both explicit market decisions.

## Work-unit index

| ID | Work unit | Kind |
|---|---|---|
| [AT-15-01](01-environment-matrix.md) | environment isolation matrix | foundation |
| [AT-15-02](02-vercel-project-linkage.md) | Vercel project linkage and runtime topology | deployment |
| [AT-15-03](03-preview-build-and-deploy.md) | gated preview build/deploy | deployment |
| [AT-15-04](04-preview-smoke-suite.md) | deployed preview smoke suite | verification |
| [AT-15-05](05-production-secret-policy.md) | production secret policy | security |
| [AT-15-06](06-database-migration-promotion-gate.md) | database migration promotion gate | database |
| [AT-15-07](07-backup-and-restore-rehearsal.md) | backup and restore rehearsal | recovery |
| [AT-15-08](08-dependency-and-secret-scan.md) | dependency, artifact, and secret scan | security |
| [AT-15-09](09-provider-outage-runbook.md) | model-provider outage | runbook |
| [AT-15-10](10-supabase-outage-runbook.md) | Supabase outage | runbook |
| [AT-15-11](11-session-recovery-runbook.md) | interrupted session recovery | runbook |
| [AT-15-12](12-access-revocation-runbook.md) | access revocation | runbook |
| [AT-15-13](13-webhook-replay-runbook.md) | authenticated commerce webhook replay | runbook |
| [AT-15-14](14-workflow-replay-runbook.md) | durable Workflow replay | runbook |
| [AT-15-15](15-clinical-package-release-runbook.md) | governed clinical package release | runbook |
| [AT-15-16](16-data-export-and-deletion-runbook.md) | scoped privacy export and deletion | runbook |
| [AT-15-17](17-colombia-controlled-rollout.md) | controlled Colombia rollout | release |
| [AT-15-18](18-us-support-activation-gate.md) | independent US activation gate | release |
| [AT-15-19](19-legacy-ingress-cutover.md) | sole-ingress legacy cutover | cutover |
| [AT-15-20](20-production-rollback.md) | production rollback and forward recovery | recovery |
| [AT-15-21](21-final-production-readiness-gate.md) | final production readiness decision | release |

## Release topology

```text
environment/secret/migration contracts
  -> immutable preview build -> deployed smoke
  -> parallel outage, recovery, replay, privacy, and package runbooks
  -> legacy ingress cutover -> full-system rollback rehearsal
  -> controlled Colombia stages
  -> independently disabled-or-approved US stages
  -> signed market-specific go/no-go packet
```

## Remote-mutation boundary

Roadmap implementation may build validators, CI definitions, runbooks, manifests, synthetic preview tests, and signed decision artifacts. Linking projects, changing environment variables, deploying, applying migrations, restoring, replaying live events/workflows, changing packages/flags/providers, cutting routes, revoking real access, promoting production, or rolling back production always requires exact-target checks and explicit authority.

## Market policy

Colombia is first and uses separately approved Colombian packages, including PAI. US support is mandatory architecture but stays disabled until its own ACIP, clinical, legal, privacy, provider, store, commerce, localization, mobile, support, rollout, and rollback evidence passes. Code presence or a country flag never constitutes approval.

## Module verification

```powershell
npm test -- tests/config tests/ci tests/smoke tests/security tests/runbooks tests/recovery tests/release
npm run eval:ci -- --reporter=junit
npm run typecheck
npm run build
npx eve info
```

## Handoff

Completion yields documentation and executable gate contracts, not a production launch. The final packet either names exact blockers or supplies a signed market-specific decision for a separately authorized release operator.
