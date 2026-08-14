# Runbook de Supabase

## Estado aplicado al 14 de agosto de 2026

- Proyecto remoto: `CreciendoApp` (`yapjiinrjsrothzgzxsv`), PostgreSQL 17, `us-east-1`.
- CLI del repositorio: Supabase 2.114.0.
- Esquema reconstruido desde cero y datos fake eliminados.
- Tres migraciones activas en `supabase/migrations/`.
- Diecisiete SQL históricos en `supabase/legacy-reference/`; nunca se ejecutan.
- Inventario y evidencia: `docs/audits/supabase/2026-08-14/`.

Supabase y sus migraciones pertenecen a `agent-trujillo`. El proyecto `creciendo` no aplica DDL.

## Credenciales

`.env` no se versiona. La app usa publishable/secret keys según entorno; las operaciones de Management API y CLI usan `SUPABASE_ACCESS_TOKEN`. Nunca se imprimen tokens, service-role keys ni URLs con contraseña.

Antes de cualquier comando remoto:

```powershell
npx supabase projects list --output-format json
npx supabase migration list --linked
```

Ambos deben identificar el project ref esperado. Si no coinciden, detenerse.

## Flujo normal

1. Escribir una prueba que demuestre el cambio o aislamiento esperado.
2. Crear una migración timestamped; no editar migraciones ya aplicadas.
3. Ejecutar localmente:

```powershell
npx supabase db reset --local
npx supabase test db --local
npx supabase db lint --local --schema public,storage --level warning
```

4. Revisar SQL, locks, grants, RLS y cambios de Storage.
5. Previsualizar el remoto con `npx supabase db push --dry-run`.
6. Aplicar solamente tras verificar entorno y backup.
7. Repetir lint, tests de aislamiento y consultas de invariantes.

## Gates de seguridad

- RLS habilitado y forzado en cada tabla expuesta.
- Cero grants de tablas de producto para `anon`.
- Tutor de otro espacio, hermano no seleccionado y acceso revocado reciben el mismo rechazo.
- Ninguna RPC vectorial tiene `EXECUTE` para `PUBLIC` o `anon`.
- Cada búsqueda vectorial limita espacio y niño antes del orden por similitud.
- Buckets clínicos privados; borrado de objetos mediante Storage API, nunca `DELETE` SQL.
- Funciones `SECURITY DEFINER` viven fuera de `public`, fijan `search_path` y tienen grants explícitos.
- Webhooks anexan eventos idempotentes; no escriben entitlements directamente.
- Una decisión urgente no crea notificación, llamada, agenda, contacto ni caso.

## Reset destructivo

`supabase db reset --linked` solo se permite para entornos sin datos reales y con autorización explícita. Antes:

1. confirmar ref, nombre, región y estado;
2. contar usuarios, filas y objetos sin leer contenido;
3. comprobar backup/PITR;
4. vaciar objetos mediante Storage API para evitar blobs huérfanos;
5. confirmar que las migraciones reproducen el estado objetivo;
6. registrar qué se elimina y su recuperabilidad.

Después, comprobar Auth, Storage, migraciones, tablas legadas, RLS, grants, buckets, Realtime y lint. El reset del 14 de agosto de 2026 siguió este procedimiento; los datos fake no son recuperables.

## Matriz RLS pendiente antes de datos reales

Para cada recurso clínico se probarán `SELECT`, `INSERT`, `UPDATE`, `DELETE` y `EXECUTE` con:

- tutor autorizado del niño;
- tutor del mismo espacio sin acceso al niño;
- tutor de otro espacio;
- acceso revocado;
- hermano distinto al contexto activo;
- usuario anónimo;
- job privilegiado con alcance correcto e incorrecto.

Una policy positiva sin casos negativos no habilita producción.
