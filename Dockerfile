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
RUN apt-get update && apt-get install -y --no-install-recommends psmisc curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Native module: better-sqlite3 (only runtime dep not bundled by tsup).
# It ships N-API prebuilds inside the package; its one dependency
# (node-addon-api) is only needed to compile it, so lib/, package.json and the
# glibc Linux binaries (the image is Debian, amd64 or arm64) are all it loads.
RUN --mount=from=deps,source=/app/node_modules,target=/deps \
    mkdir -p node_modules/better-sqlite3/prebuilds && \
    cp -rL /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/lib node_modules/better-sqlite3/ && \
    cp /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/package.json node_modules/better-sqlite3/ && \
    cp -L /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/prebuilds/linux-x64.node /deps/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/prebuilds/linux-arm64.node node_modules/better-sqlite3/prebuilds/

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

EXPOSE 8080 3000
VOLUME /app/data

CMD ["node", "apps/api/dist/entry/serve.js"]
