# Database Change Authoring Template

Use the complete section contract in [`task.md`](task.md) and add these mandatory database details to the actual leaf:

- one timestamped forward-only migration;
- exact schemas, tables, columns, types, constraints, indexes, triggers, functions, grants, RLS, Storage, or Realtime changes;
- proof that no applied migration is rewritten;
- local reset behavior;
- negative RLS/Storage/RPC matrix;
- `SECURITY DEFINER` `search_path`, authorization, and execute grants when applicable;
- data classification, retention, backfill, and idempotency;
- generated TypeScript type update;
- linked migration-list and drift checks;
- rollback strategy through a new forward migration;
- exact user authority required before any linked or destructive operation;
- backup/recoverability statement;
- `supabase db lint`, database-test, and secret-output expectations.

Database documentation never treats path structure, client metadata, or feature flags as authorization.
