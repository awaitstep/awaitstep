FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- Prune ----
FROM node:22-slim AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @awaitstep/api @awaitstep/web @awaitstep/node-cli --docker

# ---- Dependencies ----
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
ENV CI=true
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --no-frozen-lockfile

# ---- Build ----
FROM deps AS build
COPY --from=pruner /app/out/full/ .
ENV NO_DTS=1
RUN touch .env
RUN mkdir -p nodes
RUN pnpm build

# ---- Production ----
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

# Wrangler CLI (needed for local dev testing)
RUN npm install -g wrangler

# Native module: better-sqlite3 (only runtime dep not bundled by tsup)
RUN --mount=from=deps,source=/app/node_modules,target=/deps \
    mkdir -p node_modules/better-sqlite3 node_modules/bindings node_modules/file-uri-to-path && \
    cp -rL /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/lib node_modules/better-sqlite3/ && \
    cp -rL /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build node_modules/better-sqlite3/ && \
    cp /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/package.json node_modules/better-sqlite3/ && \
    cp -rL /deps/.pnpm/better-sqlite3@*/node_modules/bindings/* node_modules/bindings/ && \
    cp -rL /deps/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path/* node_modules/file-uri-to-path/

# Bundled API
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Bundled web SSR server + client assets
COPY --from=build /app/apps/web/dist ./apps/web/dist

# DB migrations
COPY --from=build /app/packages/db/drizzle ./packages/db/drizzle

# Node registry
COPY --from=build /app/nodes/registry.json ./nodes/registry.json

# Package manifests for ESM module resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

EXPOSE 8080
VOLUME /app/data

CMD ["node", "apps/api/dist/entry/docker.js"]
