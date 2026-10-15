# Despliegue de Agent Trujillo en Dokploy

Destino autorizado el 14 de octubre de 2026: Dokploy, rama `main`, dominio
`https://agent.creciendo.com.co`. Los cambios se preparan en `app_v1` y llegan a
`main` mediante pull request. Esta configuración es una alternativa solicitada
por el usuario a la topología Vercel del roadmap; no cierra sus gates pendientes.

## GitHub Actions

En `Nick0oo/AgentTrujillo`, crear el secreto de Actions
`DOKPLOY_WEBHOOK_URL` con la URL proporcionada por Dokploy. Puede ser un secreto
del repositorio o del environment `production`. La URL contiene una credencial
y nunca debe aparecer en el repositorio o en logs.

El workflow `.github/workflows/dokploy.yml` valida `app_v1` y los pull requests hacia `main`.
Cada push a `main` ejecuta TypeScript, tests, tests de workflows, construcción
Docker y smoke del contenedor con credenciales sintéticas. Solo después activa
el webhook. Dokploy recibe un evento push para `main`, el SHA y las rutas
modificadas; no recibe correos ni textos de los commits.

La validación de CI recibe configuración sintética explícita. Las instrucciones
permanentes conservan los límites del contrato aprobado sobre jurisdicción,
cálculos deterministas y datos insuficientes. Los archivos con checksums o
fixtures exactos usan LF mediante `.gitattributes` también en Windows. Cinco
archivos del algoritmo de crecimiento conservan CRLF en todas las plataformas
porque esos son los bytes registrados en los artefactos aprobados. La regla
evita modificar artefactos clínicos o sus checksums para acomodar el checkout.

Después se comprueban salud y autorización en el dominio HTTPS. La aceptación
del webhook significa que el despliegue fue encolado. Confirmar también en los
logs de Dokploy el commit que realmente se construyó; el smoke HTTP comprueba
disponibilidad y límites de acceso, no una conversación autenticada completa.

## Configuración de la aplicación en Dokploy

| Campo | Valor |
| --- | --- |
| Repositorio | `Nick0oo/AgentTrujillo` |
| Rama | `main` |
| Build type | Dockerfile |
| Dockerfile | `Dockerfile` |
| Build context | `.` |
| Puerto de aplicación | `3000` |
| Dominio | `agent.creciendo.com.co` |
| HTTPS | Activado, certificado válido |
| Réplicas | `1` |
| Volumen persistente | `/app/.eve/.workflow-data` |
| Watch paths | Vacío para este primer despliegue |

Activar **Auto Deploy** para que acepte el webhook. Usar Git genérico si se
necesita que Actions sea el único disparador; la integración GitHub de Dokploy
puede disparar despliegues directamente al push antes de que termine Actions.
No añadir un webhook directo de GitHub en paralelo al disparador del workflow.

El volumen debe ser escribible por el usuario `node` (UID/GID `1000:1000`).
Usar una sola réplica con el Workflow world local. Eve necesita sus callbacks
`/.well-known/workflow/`, además del transporte `/creciendo/v1`; conservar las
rutas completas y streaming en el proxy, sin rewrites ni caché de respuestas.
El contenedor usa callbacks locales en `127.0.0.1:3000` y mantiene cerradas las
operaciones internas de Eve en producción.

El DNS A de `agent.creciendo.com.co` debe apuntar a `72.62.165.72`. Los puertos
80/443 son los del proxy público; no publicar el puerto interno de la app como
endpoint móvil. Configurar HTTPS en el panel de Dokploy cuando esté disponible.

## Variables del contenedor

Configurar en **Environment** de Dokploy; son valores de runtime, no build args.

| Variable | Valor requerido |
| --- | --- |
| `APP_ENV` | `production` |
| `EVE_INTERNAL_CHANNEL_MODE` | `disabled` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Clave válida de Google para el backend |
| `SUPABASE_URL` | URL HTTPS del proyecto Supabase autorizado |
| `SUPABASE_PUBLISHABLE_KEY` | Clave pública/publishable del mismo proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave server-only usada por jobs/documentos |
| `CHILD_CONTEXT_SIGNING_KEY` | Clave secreta base64url de al menos 32 bytes |
| `CHILD_CONTEXT_SIGNING_KID` | Identificador de la clave actual |
| `PORT` / `NITRO_PORT` | `3000` |
| `WORKFLOW_LOCAL_BASE_URL` | `http://127.0.0.1:3000` |
| `WORKFLOW_LOCAL_DATA_DIR` | `/app/.eve/.workflow-data` |

Para rotación, conservar también los valores `CHILD_CONTEXT_PREVIOUS_SIGNING_KEY`
y `CHILD_CONTEXT_PREVIOUS_SIGNING_KID` mientras existan tokens anteriores.
`SUPABASE_JWT_ISSUER`, si se configura, debe ser exactamente la URL Supabase más
`/auth/v1`; `SUPABASE_JWT_AUDIENCE` debe ser `authenticated`.

El Dockerfile compila con valores sintéticos. No copiar `.env`, tokens de
Supabase Management, claves Apple ni datos locales al contexto Docker.
Las migraciones Supabase no se aplican automáticamente al desplegar.

## Comprobación y siguiente paso iOS

Verificación local del 14 de octubre de 2026: TypeScript y YAML válidos;
suite general con 1.845 tests aprobados y uno omitido; suite de workflows con
un test aprobado. El build Docker local está pendiente de terminar tras un
corte de red descargando dependencias. Actions también lo construye y prueba
antes de permitir el paso de despliegue.

```powershell
$env:AGENT_PUBLIC_URL = 'https://agent.creciendo.com.co'
node scripts/ci/smoke-backend.mjs
```

El smoke exige `200` con estado ready en `/eve/v1/health`, `401` sin JWT en
`/creciendo/v1/children` y `403` en `/eve/v1/info`. Después comprobar login,
selección de niño y un turno de chat desde el móvil con una cuenta de prueba.

Con el backend disponible, configurar en EAS production
`EXPO_PUBLIC_AGENT_TRUJILLO_URL=https://agent.creciendo.com.co`,
`EXPO_PUBLIC_APP_ENV=production` y las dos variables públicas de Supabase.
Luego generar el build iOS production y subirlo a App Store Connect.

## Recuperación

Para volver a una versión anterior, usar un commit conocido de `main` mediante
un revert revisado y dejar que pase el mismo workflow. Conservar el volumen de
workflows. Si el pipeline falla después de aceptar el webhook, revisar primero
el despliegue ya encolado; no asumir que el servidor quedó sin cambios.

Referencias: [Self-hosting de Eve](../../node_modules/eve/docs/guides/deployment/self-hosting.md),
[Auto Deploy de Dokploy](https://docs.dokploy.com/docs/core/auto-deploy).
