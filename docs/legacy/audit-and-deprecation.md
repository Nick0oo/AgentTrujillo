# Auditoría de legados y deprecación

## Objetivo

Rescatar conocimiento verificable de `doc-trujillo` y `creciendo_mobile` sin heredar su arquitectura, vulnerabilidades o acoplamiento. Ninguno de los dos repositorios seguirá en operación después del cutover.

## `doc-trujillo`

### Conocimiento rescatable

- perfiles y roles históricos;
- relación de niños y tutores;
- registros clínicos y adjuntos;
- signos vitales/medidas existentes;
- suscripciones y estados históricos;
- conversaciones, mensajes y auditoría;
- embeddings/RAG y almacenamiento;
- dashboard y flujos de publicación previos.

### Problemas identificados

- migración `000_full_schema.sql` destructiva junto a migraciones incrementales;
- prefijos duplicados y dependencias fuera de orden;
- relación `children.parent_id` incompatible con múltiples tutores;
- ausencia de tenant, país, zona horaria, prematuridad y consentimientos completos;
- funciones vectoriales privilegiadas sin aislamiento demostrable;
- posible elevación de rol mediante metadata del registro;
- RLS de chat centrada en `user_id` sin prueba suficiente de acceso al niño;
- buckets/URLs y fetch de imágenes que requieren endurecimiento;
- falta de motores normalizados para vacunas, medicación y desarrollo.

Los archivos SQL copiados en `agent-trujillo/supabase/migrations` se conservan solo como evidencia hasta que el remoto sea auditado. No representan una secuencia aplicable.

## `creciendo_mobile`

### Casos de uso rescatables

- autenticación;
- selector de niño;
- creación de chat con el primer mensaje;
- historial con búsqueda y paginación;
- fijar, archivar, renombrar y eliminar conversaciones;
- carga de imágenes;
- persistencia de mensajes y sesiones.

### Problemas identificados

- agente embebido y acoplado a una Edge Function;
- Gemini usado directamente sin routing ni fallback;
- respuesta sin streaming real;
- ausencia de tools deterministas;
- ausencia de evaluación de red flags anterior al modelo;
- fetch de `image_url` arbitraria con riesgo SSRF y de tamaño/contenido;
- módulos de crecimiento, vacunas, medicación y desarrollo eran placeholders;
- aislamiento y evals multi-niño no demostrados.

El código legado no se copia al nuevo repositorio. Cada caso de uso se reimplementa a través de los contratos aprobados.

## Estrategia de migración

1. Congelar la semántica de los legados y registrar commit/tag de referencia.
2. Inventariar Supabase remoto sin leer datos clínicos innecesarios.
3. Mapear cada tabla/campo legado a concepto nuevo, transformación o descarte justificado.
4. Construir backfills idempotentes con recuentos y checksums.
5. Probar en copia aislada con datos anonimizados representativos.
6. Ejecutar reconciliación y evidencias de cero cruce entre niños.
7. Cambiar Creciendo al backend nuevo mediante contratos versionados.
8. Mantener una ventana de observación sin permitir escrituras divergentes no reconciliadas.
9. Exportar artefactos de archivo, runbooks y obligaciones de retención.
10. Revocar claves, funciones y despliegues legados; marcar repositorios como archivados.

## Criterios de deprecación

`doc-trujillo` se puede archivar cuando:

- todo conocimiento rescatado está documentado;
- el schema remoto tiene baseline y migraciones reproducibles;
- no existe tráfico o webhook dirigido al dashboard legado;
- claves y roles privilegiados están revocados;
- retención y exportaciones requeridas están verificadas.

`creciendo_mobile` se puede archivar cuando:

- autenticación, selector, historial, adjuntos y chat streaming pasan E2E en Creciendo;
- no existen builds activas que dependan de la Edge Function antigua;
- se definió estrategia de actualización forzada o fin de soporte;
- secrets, buckets públicos y funciones obsoletas fueron retirados.

## Archivo

El archivo conserva README final, tag de último estado, mapa de migración, fecha de apagado y ubicación de evidencias. Archivar no significa borrar datos sujetos a retención; la eliminación se ejecuta por política y con aprobación separada.
