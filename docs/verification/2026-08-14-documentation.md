# Verificación de fundación — 2026-08-14

## Evidencia vigente

| Comprobación | Resultado |
|---|---|
| `git diff --check` | PASS, código 0 |
| `npm run typecheck` | PASS, código 0 |
| `npm run build` | PASS, código 0 |
| Supabase CLI | 2.114.0 |
| proyecto remoto | `CreciendoApp`, ref verificado |
| migraciones remotas | 3 versiones aplicadas |
| datos fake | 0 usuarios Auth, 0 objetos Storage |
| esquema nuevo | 56 tablas; contrato crítico 18/18 |
| aislamiento estructural | RLS y `FORCE RLS` en 56/56 tablas |
| acceso anónimo | 0 grants sobre tablas `public` |
| Storage | 5 buckets, todos privados |
| funciones expuestas | 0 `SECURITY DEFINER` en `public` |
| lint remoto | PASS; solo warning de función Storage administrada |
| Realtime | 4 tablas explícitas |

La consulta de verificación se ejecutó mediante el endpoint oficial de solo lectura de Management API. El inventario completo, los checksums del DDL anterior y el resultado del corte están en [la auditoría de Supabase](../audits/supabase/2026-08-14/inventory.md).

## Pruebas de base de datos

`supabase/tests/000_schema_contract.test.sql` emite TAP SQL puro y cubre las 18 tablas críticas sin depender de grants sobre el esquema de pgTAP. Tras el reset, las llamadas repetidas de `supabase test db --linked` sufrieron esperas prolongadas al inicializar el rol temporal de la CLI. No se declara esa ejecución como PASS; las 18 condiciones se comprobaron de forma equivalente con consulta remota de solo lectura.

Antes de introducir datos reales falta la matriz negativa completa de RLS: otro espacio, mismo espacio sin acceso al niño, hermano, acceso revocado, anónimo y job privilegiado con scope incorrecto.

## Preservación y alcance

- `package.json` y `package-lock.json` conservan los cambios del usuario que añadieron Supabase CLI.
- Los 17 blobs SQL legados se conservaron sin cambios en `supabase/legacy-reference/`.
- No se implementaron todavía las tools de Eve ni el canal móvil.
- Esta evidencia acredita la fundación de datos, no aprobación clínica ni disponibilidad de producción.
