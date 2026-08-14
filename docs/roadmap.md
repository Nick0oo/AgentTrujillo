# Programa de implementación de Agent Trujillo

El backend se entrega por incrementos verificables. Cada fase tiene un plan ejecutable independiente y termina con evidencia; no se aplican cambios remotos por adelantar trabajo de una fase posterior.

**Estado actual:** el corte de base de datos de B1/B2 fue autorizado y aplicado el 14 de agosto de 2026. El remoto ya usa el esquema limpio; siguen pendientes la paridad local, tipos generados, matriz negativa RLS y la interfaz `AuthorizedChildScope` antes de cerrar ambas fases.

## Fase B0 — Gobernanza y contratos

Entregables:

- uso previsto, lenguaje y ADRs aprobados;
- interface móvil `/v1` y parts generativas;
- proceso de paquetes clínicos y aprobación;
- corpus inicial de evals de aislamiento, abstención y red flags.

Gate: los docs no contienen contradicciones y el Dr. Trujillo aprueba límites clínicos y copies base.

## Fase B1 — Auditoría y baseline de Supabase

Entregables:

- CLI vinculada de forma segura;
- inventario remoto de schema, RLS, grants, funciones, Storage y Realtime;
- clasificación de riesgos y correcciones inmediatas;
- SQL legado en cuarentena;
- baseline reproducible local y tipos generados.

Gate restante: reproducir las tres migraciones localmente, generar tipos y ejecutar la matriz TAP completa. `000_full_schema.sql` ya está fuera de toda ruta aplicable.

## Fase B2 — Acceso y multi-tenancy

Entregables:

- espacios de cuidado, membresías, acceso al niño y consentimientos;
- `AuthorizedChildScope` y contexto firmado;
- RLS/grants endurecidos;
- buckets privados y auditoría;
- backfill idempotente de perfiles/niños.

Gate: matriz tutor × espacio × niño pasa con cero acceso cruzado.

## Fase B3 — Motores clínicos deterministas

Subfases independientes:

1. edad, prematuridad y antropometría;
2. vacunación PAI/ACIP;
3. formulario y validación farmacológica;
4. desarrollo y nutrición;
5. red flags.

Cada una entrega dataset con checksum, funciones puras, fuentes, aprobación, fixtures y evals. Gate: resultados reproducibles y revisión clínica por versión.

## Fase B4 — Eve y conversación

Entregables:

- sesión durable inmutable por niño;
- instrucciones y policy de tools;
- canal móvil y streaming NDJSON reanudable;
- persistencia de mensajes/tool runs;
- Gemini primario y fallback OpenRouter evaluado;
- widgets JSON y confirmaciones;
- memoria vectorial estrictamente acotada.

Gate: red flags omiten LLM, tool writes son idempotentes y los evals no recuperan memoria de hermanos.

## Fase B5 — Workflows, documentos y Realtime

Entregables:

- embeddings/resúmenes durables;
- generación de PDF;
- upload tickets y extracción controlada;
- Edge Functions de callbacks/documentos con ingreso firmado e idempotente;
- eventos privados de invalidación;
- retención y limpieza programada.

Gate: reintentos no duplican efectos, no existe fetch arbitrario y las URLs son privadas/efímeras.

## Fase B6 — Comercio y entitlements

Entregables:

- catálogo interno de planes/capacidades;
- ledger append-only;
- webhooks Apple, Google y Stripe;
- Edge Functions de ingreso y Workflows de reconciliación separados;
- reconciliación y usage ledger;
- Vercel Flags para rollout, nunca para autorización exclusiva.

Gate: duplicados y eventos fuera de orden convergen al mismo entitlement; fallos del proveedor no cruzan espacios.

## Fase B7 — Migración y cutover

Entregables:

- mapeo y backfills desde esquema legado;
- reconciliación de recuentos y checksums;
- compatibilidad temporal necesaria para builds soportadas;
- apagado de Edge Function/chat legado;
- revocación de claves y archivo de `doc-trujillo`.

Gate: rollback ensayado, cero divergencia conocida y evidencias de aislamiento/retención firmadas.

## Fase B8 — Producción y operación

Entregables:

- SLOs, rate limits, presupuestos y circuit breakers;
- Agent Runs/telemetría redactada;
- runbooks de incidente, proveedor, migración y paquete clínico;
- despliegue gradual Colombia con soporte técnico EE. UU.;
- auditoría de seguridad y privacidad antes de escalar.

Gate: pruebas end-to-end con Creciendo, checklist clínico, restauración y rollback aprobados.
