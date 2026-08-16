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
