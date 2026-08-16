# Verificación de paridad local de Supabase

Estado: paridad del módulo 02 capturada y reproducible con Docker Desktop.

## Baseline revisado

- Migraciones activas exactas: las tres fundacionales más `20260816010000_session_scope_hardening.sql`, `20260816020000_agent_command_idempotency.sql`, `20260816030000_vector_scope_hardening.sql`, `20260816040000_realtime_publication_hardening.sql`, `20260816050000_authorized_child_scope_rpc.sql` y `20260816060000_session_ownership_rpcs.sql`.
- 57 tablas de producto públicas.
- RLS habilitado y forzado en 57 tablas.
- 5 buckets privados.
- `pgvector` 0.8.2 en la imagen local actual; la auditoría histórica documenta 0.8.0 y la diferencia queda registrada para reconciliación de infraestructura.
- 0 tablas de producto publicadas en `supabase_realtime` después del endurecimiento del módulo 02.
- 0 grants de tablas públicas para `anon`.

La evidencia histórica de los conteos base está en `docs/audits/supabase/2026-08-14/inventory.md`. La captura local del módulo produjo el checksum normalizado `sha256:347b5d136f46a91fe4f792eb4e8a4910576e9b99462e08cebe2a4a92a686da01`; el verificador lo compara después de cada reset.

## Comandos permitidos

El verificador ejecuta solamente comandos locales, sin `.env`, `--linked`, `--db-url`, `--project-ref`, `db push` ni `migration push`:

```text
supabase --version
supabase status
supabase db reset --local --no-seed
supabase test db --local supabase/tests
supabase db lint --local --schema public,storage --level warning
supabase migration list --local
supabase db diff --local
```

La proyección final se obtiene con `supabase db query --local` y se normalizan campos volátiles antes de calcular SHA-256. La advertencia administrada `storage.search_by_timestamp` es la única excepción de lint permitida.

## Resultado de la ejecución local

La captura final del módulo debe registrar el reset con las nueve migraciones, la suite SQL completa, lint y `db diff --local` sin cambios de esquema.

Para completar AT-02-01, iniciar Docker Desktop y ejecutar:

```powershell
$env:RUN_LOCAL_SUPABASE_INTEGRATION = "1"
npm run verify:supabase-parity
npm test -- tests/access/local-schema-parity.test.ts
```

La salida del verificador se mantiene redactada; no se guardan URLs, tokens, dumps ni filas clínicas.
