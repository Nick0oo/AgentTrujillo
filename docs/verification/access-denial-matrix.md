# Matriz negativa de acceso y aislamiento

Estado: matriz sintética local implementada; pendiente de ejecutar dos veces contra el stack local después de cada reset.

Todas las filas usan únicamente UUIDs y contenido sintético. `allow` significa que la consulta está permitida para el principal autorizado; `zero_rows` significa que la consulta no revela filas de otro niño/espacio; `permission_denied` significa que PostgreSQL rechaza la operación/RPC.

| Recurso / acción | Authorized | sibling/no-access | foreign-space | revoked | expired | wrong-permission | anonymous | Mecanismo | Aserción SQL |
|---|---|---|---|---|---|---|---|---|---|
| `care_spaces` SELECT | allow | zero_rows | zero_rows | permission_denied | permission_denied | permission_denied | permission_denied | membership + grant | authorized/sibling/foreign/anonymous care-space |
| `care_space_members` SELECT | allow | zero_rows | zero_rows | permission_denied | permission_denied | permission_denied | permission_denied | membership RLS | authorized membership |
| `children` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission + composite scope | child visibility cases |
| `child_access` SELECT | allow | allow own row | allow own row | allow own revoked row | allow own expired row | allow own row | permission_denied | owner-visible access ledger | authorized child access |
| `documents` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission + document scope | document cases |
| `agent_sessions` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission | session case |
| `messages` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission + session FK | message case |
| `clinical_memory_items` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission + validity | memory cases |
| `clinical_memory_embeddings` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission + two-column scope | embedding cases |
| `conversation_summaries` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | permission_denied | child permission | summary case |
| `entitlements` SELECT | allow | zero_rows | zero_rows | permission_denied | permission_denied | permission_denied | permission_denied | care-space membership | entitlement cases |
| `storage.objects` SELECT | allow | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | zero_rows | document-backed path policy | storage cases |
| `match_clinical_memory` EXECUTE | allow | zero_rows | zero_rows | permission_denied | zero_rows | zero_rows | permission_denied | execute grant + child filter | RPC cases |
| `children` INSERT | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | no authenticated mutation grant | mutation case |
| `documents` UPDATE | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | no authenticated mutation grant | mutation case |
| `documents` DELETE | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | permission_denied | no authenticated mutation grant | mutation case |

The current baseline intentionally lets a principal see its own `child_access` ledger row even when revoked/expired; the protected child/product rows remain hidden. Later session and authorization leaves tighten application ownership and denial-shape behavior without weakening this database proof.

The SQL runner is [`supabase/tests/010_access_isolation.test.sql`](../../supabase/tests/010_access_isolation.test.sql). It declares 45 assertions, resets role/claims between principals, and rolls back all fixtures.

## AT-02-04 session-owner extension

The session-hardening runner is [`supabase/tests/020_session_scope_hardening.test.sql`](../../supabase/tests/020_session_scope_hardening.test.sql). It declares 32 assertions and proves:

| Scope | Authorized owner | Co-guardian with child access | Anonymous | Enforcement |
|---|---|---|---|---|
| `agent_sessions` | allow for owner | zero rows | permission denied/zero rows | owner policy + immutable scope trigger |
| `messages`, `tool_executions`, `conversation_summaries` | allow through owned session | zero rows | permission denied/zero rows | composite session scope FK + owner policy |
| `safety_evaluations` | allow through owned session | zero rows | permission denied/zero rows | nullable composite session scope FK + owner policy |

The same runner also covers orphan owner rejection, cross-child inserts, immutable owner/scope/channel/model/configuration, one-time Eve binding with legacy-session compatibility, and forced RLS. Both the baseline 45-assertion matrix and this 32-assertion extension run inside rollbackable synthetic transactions.

## AT-02-05 command idempotency extension

The command-ledger runner is [`supabase/tests/030_agent_command_idempotency.test.sql`](../../supabase/tests/030_agent_command_idempotency.test.sql). It declares 21 assertions and proves:

| Resource / action | Same full key | Different operation/child/owner | Cross session scope | Client roles |
|---|---|---|---|---|
| `agent_commands` insert | `23505` conflict | allow when full scope differs | `23503` denied | no authenticated/anon grant or policy |
| request/confirmation fingerprints | lowercase 64-hex only | changed identity denied | raw payload columns absent | service-role-only ledger |
| status transitions | terminal state is final | invalid transition `42501` | terminal timestamp required | forced RLS, no Realtime publication |
| `tool_executions.command_id` | one command parent | command scope must match | composite FK `23503` | existing execution idempotency retained |

The migration adds one public product table, so the current forced-RLS/table baseline is now 57/57; historical module-01 evidence remains immutable and is not rewritten.

## AT-02-06 vector-scope extension

The vector-hardening runner is [`supabase/tests/040_vector_scope_hardening.test.sql`](../../supabase/tests/040_vector_scope_hardening.test.sql). It declares 15 assertions and proves:

| Query | Authorized child | Sibling/no-access | Foreign space | Anonymous / legacy signature |
|---|---|---|---|---|
| `match_clinical_memory(care_space_id, child_id, ...)` | one scoped result | zero rows | zero rows | anonymous denied |
| malformed embedding scope | n/a | `23503` | `23503` | composite FK |
| count / threshold bounds | count clamped to `1..20` | invalid threshold zero rows | explicit two-dimensional predicates | old four-argument overload absent |

The five-argument RPC filters both scope IDs before similarity and returns only memory ID, type, structured content, and similarity; embeddings, searchable text, and foreign scope identifiers are not returned.

## AT-02-12 authorized-child extension

The atomic authorization RPC runner is [`supabase/tests/060_authorized_child_scope_rpc.test.sql`](../../supabase/tests/060_authorized_child_scope_rpc.test.sql). It declares 28 assertions over active, sibling, foreign, revoked, wrong-permission, malformed-required-permission, and anonymous cases. The RPC returns only scope identifiers, permissions, country/timezone, monotonic membership/access versions, and validity bounds; the application service maps every error, zero-row, multiple-row, expired, and malformed projection to the same `ACCESS_DENIED` object.

## AT-02-07 Realtime extension

The publication-hardening runner is [`supabase/tests/050_realtime_publication_hardening.test.sql`](../../supabase/tests/050_realtime_publication_hardening.test.sql). It declares 10 assertions and proves that `supabase_realtime` remains available while its public product membership is empty. The four historical raw tables (`messages`, `medication_intakes`, `medication_reminders`, `entitlements`) are unpublished, no invalidation relation is introduced early, and forced RLS/anonymous-grant invariants remain unchanged. Module 12 owns any future opaque invalidation contract.
