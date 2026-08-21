# Verificación de paridad local de Supabase

Estado: paridad del módulo 02 capturada y reproducible con Docker Desktop.

## Baseline revisado

- Migraciones activas exactas: las tres fundacionales más `20260816010000_session_scope_hardening.sql`, `20260816020000_agent_command_idempotency.sql`, `20260816030000_vector_scope_hardening.sql`, `20260816040000_realtime_publication_hardening.sql`, `20260816050000_authorized_child_scope_rpc.sql`, `20260816060000_session_ownership_rpcs.sql`, `20260816070000_session_lease_refresh_hardening.sql`, `20260816080000_session_bind_authorization_hardening.sql` y `20260816090000_session_authorization_race_hardening.sql`.
- 57 tablas de producto públicas.
- RLS habilitado y forzado en 57 tablas.
- 5 buckets privados.
- `pgvector` 0.8.2 en la imagen local actual; la auditoría histórica documenta 0.8.0 y la diferencia queda registrada para reconciliación de infraestructura.
- 0 tablas de producto publicadas en `supabase_realtime` después del endurecimiento del módulo 02.
- 0 grants de tablas públicas para `anon`.

La evidencia histórica de los conteos base está en `docs/audits/supabase/2026-08-14/inventory.md`. La captura local del módulo produjo el checksum normalizado `sha256:81d031fbbdd5c1851dd71317c4ed2d4f7ef4076573b3eecdae6cdc9d5783a550` y el checksum de inventario de migraciones `sha256:4cf1f204a647e236b80a0c48877576f5d165d526ce8cca27ddc8fb216ca6fc97`; el verificador los compara después de cada reset.

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

Resultado final del módulo: reset local con las doce migraciones; 8 archivos SQL y 195 assertions pasaron; lint terminó en código 0 con sólo la advertencia administrada `storage.search_by_timestamp`; `db diff --local` terminó sin cambios de esquema. La suite Node pasó 29 archivos, 269 tests y 1 skip explícito de integración opt-in; typecheck y tipos pasaron.

## Promoción Cloud

Se verificó `CreciendoApp` (`yapjiinrjsrothzgzxsv`, `us-east-1`) antes de aplicar. Con autorización explícita del propietario de este task, el dry-run enumeró la migración forward-only de serialización pendiente y se aplicó en orden. Postflight remoto: 12 migraciones, 57 tablas, 57 tablas con RLS forzado, 0 relaciones en `supabase_realtime`, los RPCs de ownership, refresh, bind endurecido y serialización presentes y `anon` sin EXECUTE sobre create. El lint remoto conserva únicamente la advertencia administrada de Storage.

Para completar AT-02-01, iniciar Docker Desktop y ejecutar:

```powershell
$env:RUN_LOCAL_SUPABASE_INTEGRATION = "1"
npm run verify:supabase-parity
npm test -- tests/access/local-schema-parity.test.ts
```

La salida del verificador se mantiene redactada; no se guardan URLs, tokens, dumps ni filas clínicas.

## Revalidación Cloud acumulada — 2026-08-21

Por instrucción explícita del propietario, el cierre actual se auditó directamente contra el proyecto enlazado `CreciendoApp` (`yapjiinrjsrothzgzxsv`) y se interpretó como el esquema acumulado después de los módulos 01–07, no como una fotografía aislada del módulo 02.

- El proyecto está `ACTIVE_HEALTHY`, PostgreSQL 17, región `us-east-1`.
- Las 27 migraciones locales y remotas coinciden hasta `20260817170000`; no se aplicó ninguna migración durante esta revalidación.
- La consulta de catálogo Cloud reporta 62 tablas públicas actuales, las 62 con RLS habilitado y forzado, cero grants de tabla para `anon`, cero tablas públicas en `supabase_realtime` y cero funciones `SECURITY DEFINER` sin `search_path` fijado.
- Las cinco funciones críticas actuales de acceso/sesión existen en un único overload cada una; `anon` tiene cero permisos de ejecución y `authenticated` tiene cinco. Tres son deliberadamente `SECURITY DEFINER` y cumplen el gate de `search_path`.
- La firma antigua de cuatro argumentos de `match_clinical_memory` no existe.
- El lint remoto terminó en código 0. Conserva advertencias administradas de `storage.search_by_timestamp` y una advertencia de variable no usada en `persist_country_change_reassessment`, propiedad del módulo 06.
- El verificador de tipos reprodujo primero `TYPE_DRIFT`: el archivo versionado omitía tres tablas y siete RPC introducidos por el módulo 07. Se regeneró desde Cloud, quedó en 142,636 bytes con `sha256:71cf31d244f173e62d72bd7dc62589ee076eacc9f197df876da5d7551df08fbd`, y la segunda verificación pasó. Commit: `f3b8597`.
- La suite combinada de acceso/runtime pasó 29 archivos, 272 pruebas y un único skip local opt-in; TypeScript pasó sin errores.

El intento de `db dump` de solo esquema no se usó como evidencia porque esa operación de la CLI requiere Docker Desktop incluso para el proyecto enlazado. Las verificaciones Cloud válidas se realizaron mediante `migration list`, `db lint`, generación de tipos y consultas SQL de catálogo por Management API. No se ejecutó reset local ni remoto, no se copiaron filas y no se modificaron datos de producción.
