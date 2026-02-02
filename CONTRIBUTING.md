# Contributing to AwaitStep

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9

### Getting Started

```bash
git clone https://github.com/awaitstep/awaitstep.dev.git
cd awaitstep.dev
pnpm install
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

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
