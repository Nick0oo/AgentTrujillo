# Mapa de contextos de Agent Trujillo

## Contextos

- [Acceso y cuidado](./docs/contexts/access/CONTEXT.md) — identidad, espacios de cuidado, permisos, consentimientos y alcance por niño.
- [Seguimiento pediátrico](./docs/contexts/clinical/CONTEXT.md) — observaciones, reglas versionadas, crecimiento, vacunación, medicación y desarrollo.
- [Orientación conversacional](./docs/contexts/agent/CONTEXT.md) — sesiones, memoria, tools, abstención y respuestas estructuradas.
- [Acceso comercial](./docs/contexts/commerce/CONTEXT.md) — planes, compras, ledger y entitlements.

## Relaciones

- **Acceso y cuidado → todos los contextos**: entrega un alcance autorizado e inmutable para un tutor, espacio de cuidado y niño.
- **Orientación conversacional → Seguimiento pediátrico**: solicita operaciones mediante tools tipadas; nunca implementa cálculos clínicos.
- **Seguimiento pediátrico → Orientación conversacional**: devuelve resultados estructurados, fuentes, versión y estado de confianza para presentar.
- **Acceso comercial → Orientación conversacional**: habilita capacidades y cuotas; no modifica reglas clínicas ni autorización de datos.
- **Seguimiento pediátrico → Supabase**: persiste hechos y evaluaciones con procedencia, versión y auditoría.
- **Creciendo → Orientación conversacional y Seguimiento pediátrico**: consume interfaces remotas autenticadas; no comparte implementación.
