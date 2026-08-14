# Supabase de Agent Trujillo

`agent-trujillo` es el único propietario del esquema y de las migraciones. `creciendo` consume contratos; no mantiene SQL propio.

## Migraciones activas

1. `20260814000000_platform_foundation.sql`: guardianes, espacios de cuidado, acceso por niño, consentimiento y gobernanza clínica.
2. `20260814000100_pediatric_modules.sql`: antropometría, crecimiento, vacunación CO/US, nutrición, medicación y desarrollo.
3. `20260814000200_agent_commerce_storage_security.sql`: chat/memoria de Eve, seguridad determinista, documentos privados, recordatorios, comercio, auditoría y Realtime.

Los 17 SQL de `legacy-reference/` son evidencia histórica y nunca deben ejecutarse.

## Invariantes

- Toda fila clínica incluye `care_space_id` y `child_id` y usa FK compuesta hacia el niño.
- Un tutor necesita membresía activa y acceso explícito al niño.
- `anon` no recibe grants sobre tablas de producto.
- Las mutaciones ordinarias pasan por el backend; el móvil tiene lecturas RLS acotadas.
- Todos los buckets son privados.
- La búsqueda vectorial filtra niño y espacio antes de similitud.
- La respuesta urgente solo queda registrada como decisión; no crea contacto, agenda ni notificación.
- PAI Colombia y ACIP Estados Unidos son paquetes clínicos independientes y versionados.

## Comandos

```powershell
npx supabase db reset --local
npx supabase test db --local
npx supabase db lint --local --schema public,storage --level warning
```

Para un remoto, primero verificar el ref con `supabase projects list`; nunca ejecutar `db reset --linked` sobre producción con datos reales.
