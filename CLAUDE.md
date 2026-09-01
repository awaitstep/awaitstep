# AwaitStep — Claude Code Rules

## Dependencies

- Always install the latest stable version of any new package. Check with `npm view <pkg> version` before adding.
- When updating a dependency, update it across all workspace packages that use it — not just one.

## Refactoring

- Never do massive refactors in one go. Break refactors into small, logical groups and commit each group before proceeding to the next.

## Git

- Before starting a new planned task, check for a clean worktree (`git status`). If there are uncommitted changes, commit or stash them before proceeding.
- Always create a new branch for each planned task. Branch name should relate to the task (e.g., `feat/add-env-type-to-codegen`, `fix/duplicate-workflow-runs`). Never work directly on `main` or `dev`.
- All pull requests target `dev`, not `main`.
- Never include a "Co-Authored-By" line in commit messages.
- Use conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`, `ci:`, `perf:`.
- **Commit prefixes control versioning (release-please).** `feat:` bumps minor (1.0.0 → 1.1.0), `fix:` bumps patch (1.0.0 → 1.0.1). All other prefixes (`chore:`, `refactor:`, `docs:`, `ci:`, `perf:`, `test:`) do not trigger a version bump. Use `feat:` only for genuinely new user-facing features. Bug fixes, improvements to existing features, refactors, and internal changes should use `fix:`, `refactor:`, `chore:`, or `perf:`. Adding a `!` suffix (e.g. `feat!:`) or `BREAKING CHANGE:` in the body triggers a major bump.
- Keep commits atomic — one logical change per commit. Don't mix unrelated changes.
- When multiple files were changed, group them into logical commits with related messages rather than one big commit. For example, separate "add IR types" from "add IR validation" from "add IR tests".
- Before committing, always present a detailed summary of what code changes were made — which files were added/modified/deleted, what each change does, and why. Wait for the user to review before running `git commit`.

## Code Quality

- Run `pnpm build` and `pnpm test` before considering any task complete. Fix failures before moving on.
- Run `pnpm lint` after writing new code. Fix lint errors immediately, don't leave them for later.
- Never leave `console.log` debugging statements in committed code. Use proper logging if needed.
- Prefer explicit types over `any`. If `any` is truly unavoidable, use `// eslint-disable-next-line` with a comment explaining why.
- Never inline multi-statement functions or conditional logic in JSX props. Extract them to named handler functions (e.g. `handleClose`, `handleSave`) defined above the return statement.
- **`useEffect` is the last resort — not the default.** If you can compute something from props/state/loader data, do it in the component body or `useMemo`. If you're syncing stores from loader data, do it synchronously before render. Only use `useEffect` for genuine side effects that must happen after paint (DOM measurements, subscriptions, timers). Read: https://react.dev/learn/you-might-not-need-an-effect

## API Endpoints

- When adding a new publicly exposed API endpoint, always add a corresponding entry to the playground endpoint catalog (`apps/web/src/lib/playground-endpoints.ts`) and update the API reference docs (`docs/api-reference.md`).

## Architecture

- All shared types and interfaces belong in their respective package (`@awaitstep/ir`, `@awaitstep/codegen`, etc.) — never duplicate type definitions across packages.
- Packages must not have circular dependencies. Dependency flow: `ir` → `codegen` → `provider-*`. Both `db` and `auth` are standalone.
- Every public function/type in a package must be re-exported from the package's `src/index.ts` barrel file.
- New packages follow the existing pattern: `package.json` (with build/test/lint/type-check scripts), `tsconfig.json` (extending tooling/tsconfig), `src/index.ts`.
- App code must be runtime-agnostic — no `process.env`, Node-specific APIs, or platform-specific code in app logic. All config is injected via dependency injection. Entry points (e.g. `serve.ts` for Node, Workers entry for CF) are the only files that read environment variables and initialize platform-specific resources (DB connections, etc.). The app factory (`createApp`) receives everything it needs as parameters.
- Provider-specific logic (API calls, credential checks, deploy validation) must live in `packages/provider-[name]`, never in API routes or app code. API routes call methods on the `WorkflowProvider` interface — adding a new provider should only require a new provider package.
- Route files (`routes/**/*.tsx`) are thin orchestrators — they define the `Route`, render a layout skeleton, and compose sub-components. Business logic, mutations, queries, and non-trivial UI belong in `/components/<domain>/` sub-components. A route file should rarely exceed ~80 lines. Sub-components access Zustand stores directly rather than receiving data through prop drilling from the page.

## Registry Nodes

- **Multi-version nodes use the overrides method — never duplicate `node.json` across versions.** Shared config lives in `registry/nodes/<id>/base.json`; each version contributes a small `registry/nodes/<id>/<version>/overrides.json` with only `version`, `description`, and any fields that change. The canonical example is `registry/nodes/google-gemini/`. Match its file structure 1:1 when bumping or adding a version.
- Templates are per-version (`<version>/template.ts` or `<version>/templates/<provider>.ts`) — there is no template inheritance. Copy from the previous version and apply the change.
- **Never run `registry/scripts/build-index.ts` locally.** CI (`.github/workflows/registry-index.yml`) regenerates `<version>/node.json` and `registry/index.json` on push to `main` and opens an auto-merge PR. Do NOT stage `node.json` or `index.json` — only `base.json`, `overrides.json`, and templates.
- For step-by-step guidance when versioning a node, use the `/version-node` skill.

## Database Queries (HIGHEST PRIORITY)

- **NEVER chain sequential `await` calls when a single SQL query can do the same work.** If you need data from table A to query table B, use a JOIN — not two round trips. This applies to validation checks (e.g. "fetch project then check membership") — combine them into one query with `INNER JOIN`. Violations of this rule are treated as bugs.
- Prefer Drizzle's `.select().from().innerJoin().where()` chain over raw SQL. Use raw `sql` template literals only when the query builder can't express the query.
- Filter at the SQL layer (`WHERE`, `LIMIT`, `MAX`) — never fetch all rows and filter/reduce in JS.

## Testing

- Every new module with logic must have a corresponding `.test.ts` file alongside it or in a `__tests__/` directory.
- Tests should be self-contained — no test should depend on another test's side effects or execution order.
- Use descriptive test names that explain the expected behavior, not the implementation.

## Documentation

- Don't create README.md or doc files unless explicitly asked.
- Use JSDoc only on public API surfaces (exported functions/types), not on internal helpers.
- Prefer self-documenting code (clear names, small functions) over comments explaining what code does.

## Planning

- Always write plan output (implementation plans, audit reports, task breakdowns) to the `./plan/` directory as markdown files.
- Name plan files descriptively (e.g., `phase-1-audit.md`, `refactor-connections.md`).

## File Organization

- Don't create utility grab-bag files (`utils.ts`, `helpers.ts`). Place functions in domain-specific modules.
- One concern per file. If a file grows beyond ~300 lines, it likely needs splitting.
- Test fixtures go in `__tests__/fixtures/`, not inline in test files (unless trivially small).
