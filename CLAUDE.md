# AwaitStep — Claude Code Rules

## Dependencies

- Always install the latest stable version of any new package. Check with `npm view <pkg> version` before adding.
- When updating a dependency, update it across all workspace packages that use it — not just one.

## Refactoring

- Never do massive refactors in one go. Break refactors into small, logical groups and commit each group before proceeding to the next.

## Git

- Never include a "Co-Authored-By" line in commit messages.
- Use conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`, `ci:`.
- Keep commits atomic — one logical change per commit. Don't mix unrelated changes.
- When multiple files were changed, group them into logical commits with related messages rather than one big commit. For example, separate "add IR types" from "add IR validation" from "add IR tests".

## Code Quality

- Run `pnpm build` and `pnpm test` before considering any task complete. Fix failures before moving on.
- Run `pnpm lint` after writing new code. Fix lint errors immediately, don't leave them for later.
- Never leave `console.log` debugging statements in committed code. Use proper logging if needed.
- Prefer explicit types over `any`. If `any` is truly unavoidable, use `// eslint-disable-next-line` with a comment explaining why.

## Architecture

- All shared types and interfaces belong in their respective package (`@awaitstep/ir`, `@awaitstep/codegen`, etc.) — never duplicate type definitions across packages.
- Packages must not have circular dependencies. Dependency flow: `ir` → `codegen` → `provider-*`. Both `db` and `auth` are standalone.
- Every public function/type in a package must be re-exported from the package's `src/index.ts` barrel file.
- New packages follow the existing pattern: `package.json` (with build/test/lint/type-check scripts), `tsconfig.json` (extending tooling/tsconfig), `src/index.ts`.

## Testing

- Every new module with logic must have a corresponding `.test.ts` file alongside it or in a `__tests__/` directory.
- Tests should be self-contained — no test should depend on another test's side effects or execution order.
- Use descriptive test names that explain the expected behavior, not the implementation.

## Documentation

- Don't create README.md or doc files unless explicitly asked.
- Use JSDoc only on public API surfaces (exported functions/types), not on internal helpers.
- Prefer self-documenting code (clear names, small functions) over comments explaining what code does.

## File Organization

- Don't create utility grab-bag files (`utils.ts`, `helpers.ts`). Place functions in domain-specific modules.
- One concern per file. If a file grows beyond ~300 lines, it likely needs splitting.
- Test fixtures go in `__tests__/fixtures/`, not inline in test files (unless trivially small).
