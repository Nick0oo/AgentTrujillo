# Module 12 — Persistence, Workflows, and Realtime

This module turns committed Eve/domain events into replay-safe projections, runs heavy or delayed work with Vercel Workflow DevKit, and sends private Realtime invalidation hints. It never moves urgent safety into a background process.

## Entry gate

- Modules 02, 09, 10, and 11 scope, privacy, tool, event, and channel gates pass.
- Before implementation, install/pin Workflow DevKit and read its bundled versioned docs under node_modules/workflow/docs.
- Workflow functions contain orchestration only; Node, database, provider, AI, Storage, PDF, and delivery effects live in idempotent use-step functions.
- Every job carries opaque IDs/digests and revalidates current authority at each effect.

## Exit gate

All eighteen leaves prove projection convergence, durable workflow crash/replay safety, correct FatalError/RetryableError classification, no ambiguous blind retry, confirmed-memory-only indexing, private/draft document processing, idempotent PDF generation, bounded package reevaluation, complete deletion closure, consented ordinary reminders, overlap-safe schedules, metadata-only Realtime, authorized refetch reconciliation, and zero urgent workflow/notification.

## Dependency strategy

Projection leaves 01–05 are sequential foundations. Workflows 06–12 use exclusive files and may run in parallel after projection replay. Schedules 13–14 depend on their workflows; the commerce schedule intentionally waits for module 13 reconciliation. Realtime 15–17 is a separate sequential chain. Leaf 18 integrates every durable/replay path.

## Work-unit index

| ID | Work unit | Kind |
|---|---|---|
| [AT-12-01](01-session-event-projection.md) | session event projection | projection |
| [AT-12-02](02-message-event-projection.md) | message event projection | projection |
| [AT-12-03](03-tool-execution-projection.md) | tool execution projection | projection |
| [AT-12-04](04-audit-event-projection.md) | audit event projection | projection |
| [AT-12-05](05-projection-replay-idempotency.md) | projection replay idempotency | projection |
| [AT-12-06](06-conversation-summary-workflow.md) | conversation summary workflow | workflow |
| [AT-12-07](07-memory-embedding-workflow.md) | memory embedding workflow | workflow |
| [AT-12-08](08-vaccination-card-pdf-workflow.md) | vaccination card pdf workflow | workflow |
| [AT-12-09](09-clinical-package-reevaluation-workflow.md) | clinical package reevaluation workflow | workflow |
| [AT-12-10](10-document-processing-workflow.md) | document processing workflow | workflow |
| [AT-12-11](11-retention-cleanup-workflow.md) | retention cleanup workflow | workflow |
| [AT-12-12](12-medication-reminder-workflow.md) | medication reminder workflow | workflow |
| [AT-12-13](13-retention-schedule.md) | retention schedule | schedule |
| [AT-12-14](14-commerce-reconciliation-schedule.md) | commerce reconciliation schedule | schedule |
| [AT-12-15](15-private-realtime-invalidation-schema.md) | private realtime invalidation schema | realtime |
| [AT-12-16](16-realtime-invalidation-publisher.md) | realtime invalidation publisher | realtime |
| [AT-12-17](17-realtime-reconciliation-client-contract.md) | realtime reconciliation client contract | realtime |
| [AT-12-18](18-workflow-replay-and-failure-tests.md) | workflow replay and failure tests | gate |

## Workflow implementation law

```text
API/domain outbox -> workflow/api start -> use-workflow orchestration
-> serializable IDs/digests -> idempotent use-step effects
-> persisted result/outbox -> projection -> minimal Realtime invalidation
-> authorized client refetch
```

start() is called from routes or use-step wrappers, not directly from workflow context. Integration tests use @workflow/vitest; step tests call step functions directly. Ambiguous provider effects reconcile before retry.

## Clinical and privacy boundary

Conversation summaries and document extraction create drafts only. Embeddings include active confirmed memory only. Realtime never carries clinical payload. Ordinary medication reminders require user opt-in and active declared plans; they never give missed-dose advice. Urgent red flags never start workflows, schedules, Realtime alerts, or notifications.

## Module verification

```powershell
npm test -- tests/projections tests/workflows tests/schedules tests/realtime tests/contracts
npm run eval -- workflows-realtime
npx supabase test db --local
npx workflow health
npm run typecheck
npm run build
```

## Handoff

Module 13 supplies provider-neutral entitlement projections and commerce reconciliation consumed by reminder/tool gates. Module 14 adds cross-provider observability and global eval evidence.
