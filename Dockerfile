FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/workflow-world-local ./packages/workflow-world-local
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --maxsockets=4 --fetch-retries=4
COPY . .

# Compile without production credentials. The generated server reads its
# credentials from the runtime environment when the container starts.
RUN APP_ENV=production \
    GOOGLE_GENERATIVE_AI_API_KEY=build-placeholder-not-a-real-google-key \
    SUPABASE_URL=https://build.invalid \
    SUPABASE_PUBLISHABLE_KEY=build-placeholder-not-a-real-supabase-key \
    CHILD_CONTEXT_SIGNING_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
    CHILD_CONTEXT_SIGNING_KID=build-placeholder \
    npm run build

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    APP_ENV=production \
    EVE_INTERNAL_CHANNEL_MODE=disabled \
    HOST=0.0.0.0 \
    NITRO_HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_PORT=3000 \
    WORKFLOW_LOCAL_BASE_URL=http://127.0.0.1:3000 \
    WORKFLOW_LOCAL_DATA_DIR=/app/.eve/.workflow-data

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/.eve ./.eve
# The private World adapter uses the exact Eve-vendored protocol, which differs
# from the top-level workflow dependency. Ship that factory and its licensed
# bundled dependencies; never resolve it to an unrelated installed World.
COPY --from=build --chown=node:node /app/packages/workflow-world-local ./.output/server/node_modules/@creciendo/workflow-world-local
COPY --from=build --chown=node:node /app/node_modules/eve/package.json ./.output/server/node_modules/eve/package.json
COPY --from=build --chown=node:node /app/node_modules/eve/dist/src/compiled ./.output/server/node_modules/eve/dist/src/compiled
# Ship the exact, reviewed clinical files used by the compiled server. Dataset
# loaders and the governed provider verify their checksums before evaluation.
COPY --from=build --chown=node:node /app/src/clinical/anthropometry ./src/clinical/anthropometry
COPY --chown=node:node scripts/ci/smoke-backend.mjs ./scripts/ci/smoke-backend.mjs
RUN mkdir -p /app/.eve/.workflow-data && chown node:node /app/.eve/.workflow-data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node scripts/ci/smoke-backend.mjs --once
CMD ["node", ".output/server/index.mjs"]
