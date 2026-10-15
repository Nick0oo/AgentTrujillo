# Contrato de integración con Creciendo

## Autoridad

Agent Trujillo expone exclusivamente `/creciendo/v1` como interface remota pública para Creciendo. La app puede solicitar una operación, pero el backend decide identidad, niño, país clínico, permisos, reglas y entitlements. Un campo enviado por la app nunca reemplaza estas verificaciones.

## Bootstrap de onboarding

Antes de activar el contexto del niño, la app confirma el borrador mediante `POST /creciendo/v1/onboarding`. El cuerpo versionado es `onboarding.v1`; contiene el nombre del espacio, los datos basales del niño, la relación del tutor, las alergias declaradas y `privacyConsentAccepted: true`. No contiene `guardianId`: el backend lo deriva del JWT autenticado.

La app genera una `idempotencyKey` opaca y la conserva durante los reintentos de la misma confirmación. Puede enviarla también como `Idempotency-Key`, que debe coincidir con el campo JSON. `201`/`created` confirma los IDs `careSpaceId` y `childId`; `200`/`replayed` devuelve los mismos IDs para una repetición idéntica. `409 IDEMPOTENCY_CONFLICT` o `409 ONBOARDING_ALREADY_EXISTS` no se deben convertir en éxito. La app conserva el borrador ante cualquier error y no crea IDs locales.

## Flujo de sesión

1. Creciendo obtiene un JWT de Supabase Auth.
2. `POST /creciendo/v1/child-context` recibe el niño seleccionado y verifica membresía y acceso explícito al niño.
3. El backend devuelve un contexto firmado, opaco, corto y renovable.
4. `POST /creciendo/v1/sessions` envía ese token una sola vez como `childContextToken` en el JSON y vuelve a autorizar el alcance antes de fijar la sesión.
5. Mensajes y cancelación envían el `continuationToken` rotado en JSON; el GET de stream lo envía en `X-Continuation-Token` y reanuda con `Last-Event-ID`.
6. Cada petición usa `Authorization: Bearer …`; la sesión queda fijada a un solo owner, care space y niño.
7. Cerrar sesión o revocar acceso invalida contextos y streams aunque un token todavía no haya expirado.

El token de contexto no se guarda en logs ni URLs.

## Convenciones

- JSON versionado en `/creciendo/v1`.
- Fechas ISO 8601; instantes UTC y zona IANA separada.
- Unidades clínicas explícitas y permitidas por schema.
- `idempotencyKey` obligatoria dentro del JSON exacto de crear sesión, enviar mensaje y cancelar. `Idempotency-Key` está permitido por CORS por compatibilidad, pero no sustituye el campo versionado ni concede autoridad.
- `X-Request-Id` generado o normalizado por backend.
- Paginación por cursor opaco.
- ETags o `resourceVersion` para evitar sobrescrituras.

## Streaming

`POST /creciendo/v1/sessions/{sessionId}/messages` acepta exactamente un turno autorizado e idempotente. `GET /creciendo/v1/sessions/{sessionId}/stream` responde con `application/x-ndjson`; cada línea contiene un único JSON válido. Los eventos tienen secuencia monotónica persistida, pueden reanudarse desde un cursor opaco verificado y terminan en un evento terminal seguro. El canal personalizado de Creciendo usa sesiones durables de Eve, pero autoriza ownership antes de crear, enviar, continuar, conectar, reanudar o cancelar.

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

Kinds/versiones V1 vinculantes:

- `growth_summary` / `growth.summary.v1`;
- `vaccination_status` / `vaccination.status.v1`;
- `medication_schedule_preview` / `medication.schedule-preview.v1`;
- `development_observation_preview` / `development.observation-preview.v1`;
- `nutrition_guidance` / `nutrition.guidance.v1`;
- `guardian_confirmation` / `guardian.confirmation.v1`;
- `professional_recommendation` / `professional.recommendation.v1`;
- `emergency_recommendation` / `emergency.recommendation.v1`;
- `source_list` / `sources.list.v1`;
- `dose_validation` / `medication.dose-validation.v1`;
- `tool_state` / `tool.state.v1`.

`emergency_recommendation` no admite `actions`, `url`, `phone`, `location` ni `notification`. Un schema que incluya esos campos se rechaza.

## Superficie pública canónica

| Operación | Ruta | Nota de seguridad |
|---|---|---|
| bootstrap inicial | `POST /creciendo/v1/onboarding` | identidad derivada del JWT; crea espacio, membresía, niño, acceso, observaciones declaradas y consentimiento en una transacción |
| directorio autorizado | `GET /creciendo/v1/children` | devuelve únicamente espacios y niños activos para el tutor autenticado; no concede autoridad por sí mismo |
| contexto del niño | `POST /creciendo/v1/child-context` | el ID solicitado se autoriza antes de firmar contexto |
| resumen del dashboard | `GET /creciendo/v1/dashboard` | exige `X-Child-Context`; reautoriza el alcance y devuelve una proyección backend sin cálculos clínicos del móvil |
| crear sesión | `POST /creciendo/v1/sessions` | el alcance del niño queda inmutable y no proviene del cliente |
| enviar turno | `POST /creciendo/v1/sessions/{sessionId}/messages` | revalida ownership, permiso, versión de seguridad y red flags antes de Eve |
| conectar o reanudar | `GET /creciendo/v1/sessions/{sessionId}/stream` | cursor opaco; el ID de sesión nunca concede acceso |
| cancelar | `POST /creciendo/v1/sessions/{sessionId}/cancel` | cancelación idempotente y acotada al turno autorizado |

No existen rutas públicas separadas para invocar tools o consultar autoridad clínica. Esas capacidades permanecen detrás del agente, sus contratos tipados y el alcance autorizado de la sesión.

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

### Directorio y resumen del dashboard (`AT-11-20`)

Estas lecturas son estrictamente de consulta y no sustituyen la autorización del contexto infantil:

- `GET /creciendo/v1/children` responde `creciendo.directory.v1` con `requestId`, espacios de cuidado y niños autorizados. Cada niño incluye UUID, nombre de presentación, fecha de nacimiento, país clínico y zona horaria IANA.
- `GET /creciendo/v1/dashboard` requiere `Authorization: Bearer …` y `X-Child-Context: <token opaco>`. El backend verifica el token, membresía, permiso `read`, niño y espacio antes de consultar la proyección.
- El resumen responde `creciendo.dashboard.v1`, conserva `scopeVersion: authorized-child-scope.v1`, y representa datos clínicos ausentes como `null`. La app no calcula percentiles, edad corregida, elegibilidad, dosis ni reglas.
- Ambos contratos son `no-store`, rechazan campos desconocidos y nunca exponen datos de un niño no autorizado.

### Documentos privados (`AT-11-21`)

- `GET /creciendo/v1/documents` requiere `X-Child-Context` y devuelve como máximo 100 metadatos estrictos del niño activo; no devuelve bucket, ruta ni IDs de autoridad.
- `POST /creciendo/v1/documents/upload-ticket` requiere `manage_documents`, `Idempotency-Key` y el mismo `idempotencyKey` dentro del JSON. El ticket es de máximo cinco minutos.
- `PUT /creciendo/v1/documents/upload` requiere JWT, `X-Child-Context`, `X-Document-Transfer-Token`, `content-length`, `content-type` y `x-content-sha256`; el backend comprueba tamaño, MIME y hash antes de finalizar la reserva.
- `POST /creciendo/v1/documents/download-ticket` requiere `read` e `idempotencyKey`; solo entrega un enlace HTTPS de dos minutos para un documento activo y limpio.
- `GET /creciendo/v1/documents/{documentId}/ocr-draft` devuelve únicamente borradores no confiables. Ninguna ruta convierte OCR en un hecho clínico confirmado.
- La app no escribe tablas Supabase directamente ni usa URLs de Storage de dos horas como tickets de subida.
