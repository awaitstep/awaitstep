# Contributing to AwaitStep

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9

### Getting Started

```bash
git clone https://github.com/awaitstep/awaitstep.git
cd awaitstep
pnpm install
cp .env.example .env
# Edit .env — generate TOKEN_ENCRYPTION_KEY with: openssl rand -hex 32
# Optionally set APP_NAME to customize the deployed worker package name (default: awaitstep-worker)
pnpm build
pnpm test
```

### Development

```bash
pnpm dev        # Start all apps in dev mode
pnpm build      # Build all packages and apps
pnpm test       # Run all tests
pnpm lint       # Lint all packages
pnpm type-check # Type-check all packages
```

### Custom Nodes

```bash
pnpm nodes:generate my_node    # Scaffold a new custom node
# Edit nodes/my_node/node.json and nodes/my_node/templates/cloudflare.ts
pnpm nodes:build               # Validate and bundle into nodes/registry.json
```

See [`packages/node-cli/README.md`](packages/node-cli/README.md) for the full authoring guide.

## Pull Request Guidelines

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure `pnpm build`, `pnpm test`, and `pnpm lint` pass.
4. Write a clear PR description explaining what changed and why.

## Code Style

- TypeScript strict mode
- ESM modules
- Prettier for formatting (runs automatically via lint)
- Follow existing patterns in the codebase

## Commit Messages

Use clear, descriptive commit messages. We follow conventional-ish commits:

- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `refactor: restructure code`
- `test: add or update tests`
- `chore: maintenance tasks`

## Reporting Issues

Use GitHub Issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)

## Security Issues

If you discover a security vulnerability, do NOT open a public issue. Follow the process in [SECURITY.md](SECURITY.md).

## AI Tools

This project uses AI-assisted development. See [AI_USE.md](AI_USE.md) for our AI usage policy and safeguards.

## License

AwaitStep is licensed under AGPL-3.0-only, except `packages/sdk`, `packages/templates`, `registry/` and `skills/`, which are licensed under Apache 2.0. See the License section of the [README](README.md).

By contributing, you agree that:

- your contribution is licensed under the licence of the part of the repository it changes (AGPL-3.0-only or Apache-2.0);
- you also grant AwaitStep a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to use, reproduce, modify, sublicense and distribute your contribution under the Apache License 2.0, including in AwaitStep's commercial and closed-source offerings; and
- you have the right to submit it under these terms.
