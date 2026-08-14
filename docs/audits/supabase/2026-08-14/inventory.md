# Inventario y reconstrucción de Supabase — 2026-08-14

## Objetivo verificado

- Proyecto: `CreciendoApp`.
- Project ref: `yapjiinrjsrothzgzxsv`.
- Región: `us-east-1`.
- PostgreSQL: `17.6.1.104`.
- Estado previo: `ACTIVE_HEALTHY`.
- Historial remoto previo de migraciones: vacío.

La identidad se comprobó de dos formas independientes: URL del `.env` de `agent-trujillo` y listado autenticado de proyectos de Supabase.

## Inventario previo, sin extraer contenido clínico

- 20 tablas públicas legadas y 39 policies.
- 3 usuarios en Auth, 2 niños, 2 historias, 2 signos vitales, 5 conversaciones y 22 mensajes.
- 3 buckets y 20 objetos.
- `avatars` y `storageBucketChat` eran públicos.
- 12 funciones `SECURITY DEFINER` en `public` eran ejecutables por `anon` y `authenticated`.
- `rag_embeddings` permitía lectura autenticada global.
- No había tablas publicadas en `supabase_realtime`.
- No existían backups físicos disponibles y PITR estaba deshabilitado.

Los datos fueron declarados de prueba por el propietario y se autorizó su eliminación total. No son recuperables desde Supabase. El DDL previo, sin filas, se conserva en `schema-dump.sql`; los roles se conservan en `roles-dump.sql`.

## Operación ejecutada

1. Se eliminaron los 20 objetos mediante Storage API para no dejar blobs huérfanos.
2. Se ejecutó `supabase db reset --linked --no-seed` sobre el project ref verificado.
3. Se aplicaron tres migraciones limpias:
   - `20260814000000_platform_foundation.sql`;
   - `20260814000100_pediatric_modules.sql`;
   - `20260814000200_agent_commerce_storage_security.sql`.
4. Se eliminaron por Storage API los buckets legados vacíos `rag-documents` y `storageBucketChat`.

## Estado posterior comprobado

- 0 usuarios Auth y 0 objetos Storage.
- 56 tablas de producto en `public`.
- 0 tablas legadas detectadas.
- 5 buckets, todos privados: `avatars`, `clinical-attachments`, `clinical-sources`, `generated-reports` y `vaccine-documents`.
- RLS habilitado y forzado en las 56 tablas.
- 0 grants de tablas públicas para `anon`.
- 0 funciones `SECURITY DEFINER` en el esquema expuesto `public`.
- `pgvector` 0.8.0 y embeddings de memoria de 768 dimensiones.
- Realtime limitado a `messages`, `medication_intakes`, `medication_reminders` y `entitlements`.
- El contrato de 18 tablas críticas está completo.

El lint remoto terminó con código 0. Sus únicas advertencias pertenecen a `storage.search_by_timestamp`, función interna administrada por Supabase, no a objetos de la aplicación.

## Límites de esta evidencia

El test TAP remoto quedó preparado, pero la creación repetida de roles temporales de la CLI presentó esperas prolongadas después del reset. Las mismas 18 precondiciones se verificaron mediante el endpoint oficial de consulta de solo lectura de Management API. Las pruebas negativas completas de RLS siguen siendo gate obligatorio antes de conectar datos reales.
