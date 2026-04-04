---
title: Pull Requests
---

# Pull Requests

## Before you start

1. **Check for open issues.** If you're working on a bug fix or feature, check the issue tracker first to avoid duplicate work.
2. **Discuss large changes first.** For significant new features or architectural changes, open an issue or discussion before writing code.
3. **Ensure a clean worktree.** Start new work from a clean git state (`git status`).

## Branch workflow

All pull requests target the `dev` branch, not `main`. `main` is the stable release branch.

```bash
# Start from the latest dev branch
git checkout dev
git pull origin dev

# Create a task branch
git checkout -b feat/my-feature
# or
git checkout -b fix/the-bug-description
```

Branch names should be descriptive and use `/` as a separator. Examples:

- `feat/add-slack-node`
- `fix/expression-resolver-nested-path`
- `refactor/codegen-branch-generator`
- `chore/update-wrangler`

## Making commits

Use conventional commit prefixes:

| Prefix      | When to use                              |
| ----------- | ---------------------------------------- |
| `feat:`     | New user-facing feature                  |
| `fix:`      | Bug fix                                  |
| `refactor:` | Code restructure with no behavior change |
| `test:`     | Adding or updating tests                 |
| `chore:`    | Maintenance (deps, config, tooling)      |
| `docs:`     | Documentation changes                    |
| `ci:`       | CI/CD changes                            |
| `perf:`     | Performance improvement                  |

Keep commits **atomic** — one logical change per commit. Do not mix unrelated changes.

```bash
# Good — separate logical changes
git commit -m "feat: add slack_post_message node"
git commit -m "test: add cloudflare template tests for slack_post_message"

# Bad — mixing unrelated changes
git commit -m "add slack node and fix typo in README and update deps"
```

:::warning
`feat:` triggers a minor version bump. Use it only for genuinely new user-facing features. Improvements to existing features, bug fixes, and internal changes should use `fix:`, `refactor:`, or `chore:`.
:::

## CI checks

All pull requests must pass the CI pipeline before merging:

| Check      | Command          | What it verifies                |
| ---------- | ---------------- | ------------------------------- |
| Type check | `pnpm typecheck` | No TypeScript errors            |
| Lint       | `pnpm lint`      | ESLint passes with no errors    |
| Tests      | `pnpm test`      | All test suites pass            |
| Build      | `pnpm build`     | All packages build successfully |

Run these locally before pushing:

```bash
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

## Opening the PR

1. Push your branch: `git push -u origin feat/my-feature`
2. Open a PR on GitHub targeting `dev`.
3. Fill in the PR description:
   - What problem does this solve?
   - What approach did you take?
   - Any areas the reviewer should pay attention to?
4. Link the related issue if there is one.

## Review process

- A maintainer will review and leave feedback within a few business days.
- Address feedback with new commits (do not force-push after review starts).
- Once approved, a maintainer will merge the PR.

## Adding a new node

For new nodes, the PR must include:

- [ ] `nodes/<node_id>/node.json`
- [ ] `nodes/<node_id>/README.md`
- [ ] `nodes/<node_id>/templates/cloudflare.ts` (at minimum)
- [ ] `nodes/<node_id>/tests/cloudflare.test.ts`
- [ ] All tests passing

Run the node validator before submitting:

```bash
pnpm node-cli validate nodes/<node_id>
```

See [Adding Nodes](./adding-nodes.md) for the full walkthrough.
