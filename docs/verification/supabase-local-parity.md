# Verificación de paridad local de Supabase

Estado: baseline local capturado y reproducible con Docker Desktop.

## Baseline revisado

- Migraciones activas exactas: `20260814000000_platform_foundation.sql`, `20260814000100_pediatric_modules.sql` y `20260814000200_agent_commerce_storage_security.sql`.
- 56 tablas de producto públicas.
- RLS habilitado y forzado en 56 tablas.
- 5 buckets privados.
- `pgvector` 0.8.2 en la imagen local actual; la auditoría histórica documenta 0.8.0 y la diferencia queda registrada para reconciliación de infraestructura.
- 4 tablas publicadas en `supabase_realtime` antes del endurecimiento del módulo 02.
- 0 grants de tablas públicas para `anon`.

La evidencia histórica de estos conteos está en `docs/audits/supabase/2026-08-14/inventory.md`. La captura local actual produjo el checksum normalizado `sha256:a52af673f83b4915a974328d5391878b4a8db47621797f74830499827b4f6b95`; el verificador lo compara después de cada reset.

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

Docker Desktop se inició y el reset local terminó con las tres migraciones. La prueba SQL contractual pasó con 18 tests, lint terminó con código 0 y `db diff --local` no encontró cambios de esquema.

Para completar AT-02-01, iniciar Docker Desktop y ejecutar:

```powershell
$env:RUN_LOCAL_SUPABASE_INTEGRATION = "1"
npm run verify:supabase-parity
npm test -- tests/access/local-schema-parity.test.ts
```

La salida del verificador se mantiene redactada; no se guardan URLs, tokens, dumps ni filas clínicas.
