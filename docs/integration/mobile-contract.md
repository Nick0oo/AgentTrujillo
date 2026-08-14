# Contrato de integración con Creciendo

## Autoridad

Agent Trujillo expone `/v1` como interface remota. Creciendo puede solicitar una operación, pero el backend decide identidad, niño, país clínico, permisos, reglas y entitlements. Un campo enviado por la app nunca reemplaza estas verificaciones.

## Flujo de sesión

1. Creciendo obtiene un JWT de Supabase Auth.
2. `POST /v1/child-contexts` recibe el niño seleccionado y verifica membresía y acceso explícito al niño.
3. El backend devuelve un contexto firmado, opaco, corto y renovable.
4. Cada petición usa `Authorization: Bearer …` y `X-Child-Context: …`.
5. Una sesión de Eve se crea para ese alcance y no permite cambiar de niño.
6. Cerrar sesión o revocar acceso invalida contextos y streams.

El token de contexto no se guarda en logs ni URLs.

## Convenciones

- JSON versionado en `/v1`.
- Fechas ISO 8601; instantes UTC y zona IANA separada.
- Unidades clínicas explícitas y permitidas por schema.
- `Idempotency-Key` obligatoria para comandos.
- `X-Request-Id` generado o normalizado por backend.
- Paginación por cursor opaco.
- ETags o `resourceVersion` para evitar sobrescrituras.

## Streaming

`POST /v1/chat/sessions/{sessionId}/messages` responde con `application/x-ndjson`. Los eventos tienen `sequence`, pueden reanudarse y terminan en `message-complete` o `stream-error`. El canal personalizado de Creciendo usa las sesiones durables de Eve, pero autoriza ownership antes de enviar, continuar, cancelar o abrir un stream.

Tipos permitidos:

- `text-delta`;
- `tool-state` con estados no sensibles;
- `ui-part` validada;
- `message-complete`;
- `stream-error` con error seguro.

El backend persiste el mensaje del tutor antes de ejecutar efectos y asocia tool calls con idempotency keys. Reanudar un stream no repite una escritura.

Las rutas estándar `/eve/v1/*` quedan para operación interna y no son la interface pública del móvil, ya que el route auth de Eve por sí solo no garantiza ownership multiusuario de una sesión.

## Generative UI

Una part contiene `kind`, `version`, `data` y, cuando aplica, `confirmationId`. El móvil mantiene un registro cerrado de widgets. No se envía JSX, HTML o JavaScript.

Kinds V1:

- `growth_summary`;
- `vaccination_status`;
- `medication_schedule_preview`;
- `development_observation_prompt`;
- `nutrition_guidance`;
- `guardian_confirmation`;
- `professional_recommendation`;
- `emergency_recommendation`;
- `source_list`.

`emergency_recommendation` no admite `actions`, `url`, `phone`, `location` ni `notification`. Un schema que incluya esos campos se rechaza.

## Consultas y comandos

| Recurso | Consulta/comando | Nota de seguridad |
|---|---|---|
| niño activo | `POST /v1/child-contexts` | el ID solicitado se autoriza antes de firmar contexto |
| dashboard | `GET /v1/dashboard` | proyección de un único niño |
| antropometría | `GET/POST /v1/anthropometry` | escritura confirmada e idempotente |
| crecimiento | `GET /v1/anthropometry/growth` | cálculo backend con versión |
| vacunas | `GET /v1/immunization/status` | país proviene del niño |
| dosis aplicada | `POST /v1/immunization/administrations` | OCR solo produce borrador |
| medicación | `GET/POST /v1/medication-plans` | no crea prescripción |
| adherencia | `POST /v1/medication-intakes` | reintentos no duplican |
| desarrollo | `GET/POST /v1/development-observations` | observación, no diagnóstico |
| chat | `/v1/chat/sessions` | sesión inmutable por niño |
| documentos | `POST /v1/documents/upload-ticket` | bucket privado y tipo/tamaño limitados |
| comercio | `GET /v1/entitlements` | resultado del ledger interno |

## Realtime

Supabase Realtime emite eventos privados de invalidación con recurso, versión y request ID. No publica el cuerpo completo de una conversación o historia. La app vuelve a consultar la interface autenticada.

## Errores seguros

El contrato distingue autenticación, contexto infantil, validación, confirmación, entitlement, conflicto, rate limit, regla clínica y proveedor. Nunca devuelve SQL, prompt, modelo, política RLS, stack trace o existencia de un niño no autorizado.

Regla de fallo:

- fallo técnico antes de una escritura: no confirmar;
- fallo después de commit: reintentar con la misma idempotency key y devolver el resultado existente;
- fallo clínico o de proveedor: abstención;
- red flag: la respuesta urgente no espera a Eve ni a un workflow.

## Contratos compartidos

Los schemas Zod del backend generan fixtures JSON y una especificación OpenAPI versionada. Creciendo genera/adapta sus tipos a partir de esos artefactos, pero no importa código fuente del backend ni crea una dependencia entre repositorios en tiempo de compilación.

Cada cambio de contrato exige:

- prueba del schema en backend;
- fixture de éxito y de cada error relevante;
- prueba de consumo en móvil;
- compatibilidad con la versión móvil mínima soportada;
- actualización de estos Markdown.
