# Self-Host CLI (`npx awaitstep`)

## Goal

A lightweight npm package that manages AwaitStep Docker deployments. Replaces `scripts/install.sh` with a cross-platform CLI that handles install, update, and lifecycle management.

## Commands

```bash
npx awaitstep install     # First-time setup
npx awaitstep update      # Pull latest image, restart
npx awaitstep stop        # Stop the container
npx awaitstep start       # Start a stopped container
npx awaitstep logs        # Tail container logs
npx awaitstep status      # Show running state, version, uptime
npx awaitstep uninstall   # Stop and remove container + volumes (with confirmation)
```

## `install` flow

1. Check Docker + Docker Compose installed
2. Prompt for port (default 8080)
3. Prompt for DATABASE_URL (optional — blank = SQLite)
4. Auto-generate TOKEN_ENCRYPTION_KEY and BETTER_AUTH_SECRET
5. Write `.env` and `docker-compose.yml`
6. `docker compose pull && docker compose up -d`
7. Print access URL and next steps

## `update` flow

1. Check docker-compose.yml exists in cwd
2. `docker compose pull`
3. `docker compose up -d` (recreates with new image)
4. Print new version info

## Package structure

```
packages/cli/
├── package.json          # name: "awaitstep", bin: { awaitstep: "./dist/cli.js" }
├── tsup.config.ts
├── src/
│   ├── cli.ts            # arg parsing, command dispatch
│   ├── commands/
│   │   ├── install.ts
│   │   ├── update.ts
│   │   ├── stop.ts
│   │   ├── start.ts
│   │   ├── logs.ts
│   │   ├── status.ts
│   │   └── uninstall.ts
│   └── utils/
│       ├── docker.ts     # docker compose wrappers
│       ├── secrets.ts    # key generation
│       └── templates.ts  # .env and docker-compose.yml templates
```

## Key decisions

- **Published to npm** as `awaitstep` — users run `npx awaitstep install`
- **No runtime deps** — uses child_process to shell out to docker/docker compose
- **Cross-platform** — Node.js crypto for secret generation (no openssl dependency)
- **Idempotent install** — if .env exists, prompt to overwrite or keep existing secrets
- **Version pinning** — `install` and `update` can accept `--version` flag to pin to a specific image tag

## Open questions

- Should `install` support `--pg` flag that prompts for DATABASE_URL?
- Should `status` show the current image digest for easy version checking?
- Do we need `awaitstep config` to edit .env interactively?

## Dependencies

- Depends on Phase 1 (Docker self-hosting) being complete ✅
- The CLI generates the same docker-compose.yml and .env that `scripts/install.sh` does
- `scripts/install.sh` can be removed once the CLI is shipped
