# Contrato de reconciliación Realtime de Creciendo v1

## 1. Propósito y autoridad

Este contrato define cómo Creciendo consume el canal privado de invalidaciones de
Agent Trujillo. Realtime solo indica que una proyección puede haber cambiado. La
fuente de verdad sigue siendo la interfaz HTTP autorizada de Agent Trujillo y la
autorización actual del tutor para el niño activo.

El móvil no interpreta una invalidación como un hecho clínico, no renderiza su
contenido y no concede autoridad a partir del tópico, el `resourceId`, la versión,
el cursor ni el payload recibido. Un evento perdido, duplicado, atrasado, forjado o
mal formado produce una reconciliación segura o se descarta; nunca inventa datos.

## 2. Versión y tópico privado

La versión vinculante es `creciendo.realtime-invalidation.v1`.

El tópico se deriva exclusivamente del contexto infantil autorizado vigente:

```text
private-creciendo-v1:<careSpaceId>:<childId>
```

`careSpaceId` y `childId` son UUID opacos. No se incluyen nombres, mensajes,
diagnósticos, medicamentos, dosis, vacunas, medidas, documentos, prompts ni otros
datos clínicos. El cliente solo intenta suscribirse después de obtener un contexto
infantil válido; el servidor de Realtime debe volver a comprobar membresía y acceso.
El ID del tópico nunca sustituye el JWT ni el contexto infantil.

La suscripción pertenece a un único `(guardian, careSpace, child, scopeVersion)`.
Al cambiar el niño, expirar el contexto, cerrar sesión o recibir una revocación, el
cliente cancela la suscripción anterior antes de mostrar datos del nuevo contexto.

## 3. Evento permitido

El único evento de aplicación permitido es `invalidation`. Su forma lógica es:

```json
{
  "contractVersion": "creciendo.realtime-invalidation.v1",
  "resourceKind": "growth",
  "resourceId": "00000000-0000-4000-8000-000000000000",
  "resourceVersion": 12,
  "sequence": 44,
  "sourceEventId": "00000000-0000-4000-8000-000000000001"
}
```

Todos los identificadores son opacos UUID; `resourceVersion` y `sequence` son
enteros positivos seguros. La lista cerrada de `resourceKind` es:

`child`, `dashboard`, `growth`, `immunization`, `medication`, `development`,
`document`, `conversation`, `nutrition`, `settings`.

No son campos permitidos: contenido clínico, nombres, texto de conversación,
partes de mensajes, decisiones urgentes, datos de vacunas, valores antropométricos,
medicamentos, dosis, documentos, URLs, teléfonos, acciones, tokens, prompts,
stack traces o instrucciones. Un evento con campos desconocidos, tipos inválidos,
versión de contrato desconocida o datos sensibles se ignora y se registra solo con
un código técnico acotado.

## 4. Cursor y versiones

El cliente mantiene estado no clínico separado por scope:

```text
(guardianId, careSpaceId, childId, scopeVersion)
  -> lastSequence, resourceKind/resourceId -> lastResourceVersion
```

- `sequence <= lastSequence` se descarta como duplicado o atrasado.
- `resourceVersion <= lastResourceVersion` se descarta como duplicado o atrasado.
- Una secuencia mayor que la esperada marca un hueco y solicita reconciliación.
- Una versión mayor marca el recurso como stale y solicita refetch.
- Nunca se aplica una versión menor sobre una mayor.
- El mapa se borra al cambiar de niño, cerrar sesión, revocarse el acceso o
  invalidarse el contexto.

El cursor y el mapa son ayudas de caché, no autoridad persistente ni mecanismo de
autorización. No se envían al backend como prueba de acceso.

## 5. Reconciliación y refetch

Cada `resourceKind` debe tener un refetcher autorizado en el registro de la versión
del móvil. El refetcher recibe el contexto infantil vigente y vuelve a comprobar que
la respuesta pertenece exactamente al mismo `(careSpaceId, childId, scopeVersion)`
antes de reemplazar caché.

El orden es:

1. Validar forma, versión, scope local y secuencia.
2. Marcar el recurso como stale; no presentar el payload del evento.
3. Cancelar un refetch anterior del mismo recurso y conservar solo el más reciente.
4. Consultar la interfaz autorizada del recurso con `Authorization` y el contexto
   infantil requerido por su contrato.
5. Reemplazar atómicamente la caché solo si la respuesta conserva el scope vigente.
6. Actualizar la versión/cursor después de una respuesta válida.

Un `401`/`403` limpia inmediatamente el scope y desuscribe el tópico. Un `404` del
niño o recurso se trata como eliminación/no disponible: se eliminan sus datos de
caché y no se revela si existió para un tutor sin autorización. Un error de red o
proveedor conserva la caché marcada como stale, muestra estado no actualizado y
reintenta con backoff limitado; no fabrica una respuesta.

## 6. Conexión, suspensión y backfill

Al conectar, reconectar o volver al foreground, el cliente no asume que recibió todos
los eventos. Hace una reconciliación autorizada del niño activo y de los recursos
marcados stale. Si el proveedor informa un hueco, el cursor está vencido, el outbox
ya expiró o la versión del contrato no coincide, ejecuta esa reconciliación completa.

En background no se realizan efectos clínicos ni se muestran alertas desde Realtime.
Al volver al foreground se renueva el contexto si corresponde y se reconcilia antes
de mostrar datos potencialmente obsoletos. El polling de respaldo es opcional,
acotado, cancelable y solo consulta refetchers autorizados; no consulta tablas
clínicas directamente desde el móvil.

## 7. Cambio de niño, revocación y eliminación

El cambio de niño es una barrera de aislamiento: cancelar suscripciones, abortar
requests/streams/refetches, borrar cachés temporales y activar el nuevo contexto en
ese orden. Ningún resultado tardío del niño anterior puede poblar el nuevo estado.

La revocación, logout, cambio de tutor o expiración del token cancela el tópico,
borra el contexto y los datos clínicos en caché según el contrato de sesión. No se
reintenta con el contexto anterior.

Una eliminación o ausencia confirmada borra datos, cursores, versiones, borradores
temporales y archivos temporales asociados al niño o recurso. El cliente no crea un
tombstone clínico; solo conserva un marcador técnico mínimo para evitar reintentos
inmediatos y lo elimina al cambiar de scope.

## 8. Privacidad, urgencias y fallos

El canal no transporta PHI ni decisiones urgentes. Una bandera roja solo se entrega
por el stream de sesión y conserva su contrato terminal; una invalidación nunca
crea una alarma, notificación, llamada, caso clínico, workflow o acción profesional.

Los logs contienen únicamente `contractVersion`, `resourceKind`, códigos acotados,
scope hash y contadores. Nunca contienen IDs de niño en texto libre, nombres,
payloads, tokens, contenido o URLs. Los errores de parseo, scope, autorización y
proveedor se clasifican sin enumerar la existencia de recursos.

## 9. Compatibilidad

El backend y el móvil deben aceptar exactamente esta versión antes de activar el
canal. Un contrato desconocido desactiva Realtime para ese cliente y usa la
reconciliación autorizada disponible. No se hace fallback a una tabla clínica, a un
endpoint no registrado ni a una respuesta cacheada como si fuera fresca.
