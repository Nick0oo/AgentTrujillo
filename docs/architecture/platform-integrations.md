# Integraciones de plataforma

## Eve y AI SDK

Eve 0.27.1 es el runtime durable y filesystem-first del agente. AI SDK 7 es una dependencia interna de Eve y la base para modelos, streaming y tool calling. No se construye un segundo agente paralelo con `ToolLoopAgent`; las tools de Eve adaptan las interfaces del dominio clínico.

Reglas de implementación:

- consultar `node_modules/eve/docs/` y `node_modules/ai/docs/` de las versiones instaladas antes de escribir código;
- conservar las rutas estándar `/eve/v1/*` para operación interna;
- exponer a Creciendo un canal Eve personalizado que comprueba ownership multiusuario;
- usar los eventos durables de Eve y NDJSON, no inventar una segunda persistencia conversacional;
- validar mensajes/parts con los tipos reales de AI SDK/Eve instalados;
- no mostrar ni almacenar reasoning interno en el móvil;
- limitar pasos, tools, tokens, tiempo y coste por turno.

El archivo actual `agent/agent.ts` usa `anthropic/claude-sonnet-5` como placeholder del starter y `eve build` falla porque Gateway no conoce su ventana de contexto. El catálogo consultado el 14 de agosto de 2026 muestra `google/gemini-3.7-flash` en AI Gateway y OpenRouter; se adopta como candidato inicial de desarrollo, no como aprobación clínica. Debe superar los evals y volver a comprobarse en el catálogo vivo antes de desplegar.

## Vercel AI Gateway y OpenRouter

AI Gateway es la entrada primaria para inferencia generativa. Eve acepta IDs `provider/model`, por lo que el modelo Google aprobado se configura mediante Gateway y obtiene routing, costes y observabilidad.

Política:

1. Consultar `gateway.getAvailableModels()` o el catálogo oficial durante la implementación.
2. Elegir un modelo Google vigente mediante evals pediátricos, no por novedad o benchmark general.
3. Enviar un identificador de usuario seudónimo para rate limiting/costes; nunca email, nombre o `child_id`.
4. Etiquetar ambiente, capacidad y plan sin incluir datos clínicos.
5. Desactivar cache para conversaciones y contexto clínico individual.
6. No activar content logging de prompts/respuestas.
7. Configurar presupuestos, límites por tutor y circuit breaker.
8. Terminar en abstención ante HTTP 402/429/5xx cuando no exista fallback aprobado.

OpenRouter es la contingencia solicitada. Vive detrás del mismo port `ModelRouter` y solo puede usar modelos que superen los evals de Gemini. Si AI Gateway ofrece la ruta de proveedor requerida en el momento de implementar, se configura allí; si no, el adapter OpenRouter usa AI SDK compatible y mantiene la misma policy, telemetría y límites. Nunca es un escape para saltarse Gateway, fuentes o guardrails.

Embeddings se resuelven mediante un adapter directo y un modelo fijado por versión, porque AI Gateway no se asume como transportador de embeddings. Cambiar de modelo exige reindexación separada y coexistencia por `embedding_model`.

## Chat SDK

Vercel Chat SDK (`chat` y `@chat-adapter/*`) está diseñado para bots en Slack, Teams, Google Chat, Discord, Telegram, WhatsApp, GitHub o Linear. No es el cliente React Native de Creciendo y no se instalará en V1 solo para cumplir un nombre de stack.

Eve gestiona el chat móvil. Chat SDK queda como expansión futura si Agent Trujillo se publica en WhatsApp u otro canal. En ese caso:

- cada adapter verifica webhooks y deduplica eventos;
- la plataforma externa no transporta datos de un niño hasta completar vinculación y consentimiento;
- un thread externo se liga a un único alcance autorizado;
- la lógica del bot llama las mismas interfaces de dominio y no duplica prompts/reglas;
- mensajes urgentes mantienen la política de recomendación sin botones ni contacto automático;
- el state adapter no se convierte en la historia clínica ni en la fuente de verdad.

## Generative UI

Eve/AI SDK producen parts estructuradas; el backend las transforma a una unión JSON versionada. Creciendo itera las parts y renderiza únicamente componentes locales conocidos.

Reglas:

- nunca serializar JSX, HTML o JavaScript para ejecución remota;
- no mostrar un `JSON.stringify` de tool outputs al tutor;
- estados de tool: validando, esperando confirmación, completada, denegada o fallida;
- no exponer input interno, reasoning, prompts o errores del proveedor;
- schemas de entrada y salida se validan tanto en backend como en app;
- parts desconocidas degradan a texto seguro;
- `emergency_recommendation` rechaza acciones, URL, teléfono, ubicación y notificación.

AI Elements no se adopta porque está orientado a interfaces web/shadcn; Creciendo implementa primitives nativas accesibles sobre Tamagui.

## Supabase Edge Functions

Edge Functions se usan como adapters de ingreso cercanos a Supabase, no como un segundo dominio backend.

Funciones previstas:

- `stripe-webhook`: verifica firma sobre raw body y registra un evento comercial inmutable;
- `apple-notifications`: verifica notificación server-to-server y registra su evento;
- `google-play-notifications`: verifica el mensaje autorizado y registra su evento;
- `document-callback`: recibe únicamente callbacks de proveedores permitidos para un documento ya creado.

Cada función valida tamaño, content type, timestamp/replay, firma/autenticación y provider event ID. Inserta mediante una interface SQL/RPC mínima e idempotente y responde rápido. No calcula entitlements, no ejecuta reglas pediátricas, no descarga URLs arbitrarias y no llama modelos. Un Workflow toma el evento persistido y realiza reconciliación, reintentos y proyecciones.

Secrets viven en Supabase secrets, nunca en código o el móvil. Los deployments y logs de funciones forman parte de la auditoría remota.

## Workflow DevKit

Vercel Workflow DevKit usa el paquete `workflow` y las directivas `"use workflow"`/`"use step"`. Se instala cuando inicia la fase B5 y se consulta su documentación empaquetada. Eve ya hace durable la conversación, así que no se introduce `DurableAgent` adicional.

Workflows autorizados:

- embeddings y reindexación;
- resúmenes extensos;
- generación de carnet/PDF;
- reevaluación después de activar un paquete clínico;
- reconciliación de webhooks/entitlements;
- retención y limpieza programada.

Las funciones workflow solo orquestan datos serializables. I/O, crypto, SDKs externos y SQL viven en steps con acceso Node. Cada step es idempotente, clasifica errores permanentes/transitorios y se prueba de forma unitaria; flows con reintentos/hook se prueban con `@workflow/vitest`.

Exclusiones:

- red flags y recomendación de urgencias;
- autorización de una petición;
- validación síncrona antes de guardar una dosis;
- operaciones que no toleran reintento sin idempotencia.

## Vercel Flags

Vercel Flags se usa para rollout gradual, experimentos y disponibilidad por ambiente. La implementación consultará la documentación viva del paquete `flags` v4 y ejecutará decisiones exclusivamente en servidor.

Una flag puede decidir:

- porcentaje de tutores que ve un widget nuevo;
- habilitación progresiva de una tool ya autorizada;
- modelo aprobado para un cohorte de eval/rollout;
- país o ambiente en el que se presenta una función.

Una flag no puede decidir:

- si un tutor accede a un niño;
- si una red flag se ignora;
- si una dosis es válida;
- si existe un entitlement Premium;
- si una regla clínica sin aprobación se publica.

El backend evalúa primero identidad, child scope, paquete clínico y entitlement; la flag solo reduce disponibilidad. Creciendo recibe capacidades resueltas y no consulta Flags directamente.

## Stripe, Apple y Google

El backend mantiene un ledger comercial común.

### Stripe

- Checkout web y Customer Portal se crean en servidor.
- El customer se deriva del espacio de cuidado autenticado; nunca se acepta un `customerId` arbitrario del cliente.
- El webhook verifica `Stripe-Signature` contra el raw body antes de parsear.
- `event.id` es clave idempotente y el payload original se conserva según política de datos.
- Secret key y webhook secret viven solo en Vercel/Supabase secrets.
- El API version se fija al implementar con la versión actual del SDK y se prueba antes de actualizar.

### Apple y Google

- Creciendo inicia la compra mediante las APIs de tienda.
- El backend verifica transacción/recibo y notificaciones server-to-server.
- IDs de evento/transacción se insertan una sola vez en el ledger.
- Restauraciones, grace periods, refunds, revocations y eventos fuera de orden se reconcilian.

### Entitlements

Una proyección de Supabase calcula capacidades a partir del ledger. Los webhooks no actualizan directamente una bandera `premium`; tampoco Vercel Flags o un recibo local desbloquean acceso por sí solos.

## Observabilidad y privacidad

- Agent Runs se usa para lifecycle, tool calls, latencia y coste con redacción.
- AI Gateway conserva modelo, tokens, latencia, status y failover sin content logging.
- Workflows conserva runs/steps sin payload clínico innecesario.
- Stripe/tiendas conservan IDs comerciales, no datos clínicos.
- Todos comparten `request_id`/correlación opaca, nunca nombre o child ID externo.
- Logs y drains respetan retención, acceso mínimo y residencia/configuración aplicable.
