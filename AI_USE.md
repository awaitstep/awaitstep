# AI Usage Policy

This document describes how AI tools are used in AwaitStep development and what safeguards are in place.

## Tools Used

- **Claude Code** (Anthropic) — AI coding assistant used during development
- **Claude** (Anthropic) — Used for planning, documentation, and code review

## How AI Is Used

- **Code generation** — Writing new features, tests, and boilerplate
- **Refactoring** — Restructuring existing code with guidance from maintainers
- **Code review assistance** — Identifying potential issues in proposed changes
- **Documentation** — Drafting and updating technical documentation
- **Planning** — Breaking down tasks, designing architecture, and auditing code

## How AI Is NOT Used

- **Final security decisions** — All security-related changes are reviewed and approved by human maintainers
- **Architecture decisions** — System design is driven by maintainers; AI assists with analysis but does not make structural choices
- **Release approval** — All releases are reviewed and approved by humans
- **Dependency selection** — Humans choose which dependencies to adopt
- **User data access** — AI tools do not have access to production data or user information

## Safeguards

All AI-generated code goes through the same quality gates as human-written code:

1. **Human review** — Every change is reviewed by a maintainer before merge
2. **Type checking** — TypeScript strict mode catches type errors
3. **Automated tests** — Full test suite must pass (`pnpm test`)
4. **Linting** — Code style and quality checks (`pnpm lint`)
5. **CI pipeline** — All checks run in CI before merge is allowed
6. **Coding standards** — AI operates under explicit project rules (defined in [CLAUDE.md](CLAUDE.md)) that enforce architecture constraints, code quality standards, and security practices

## Transparency

- AI-assisted development is disclosed here and in [CONTRIBUTING.md](CONTRIBUTING.md)
- The project's AI configuration ([CLAUDE.md](CLAUDE.md)) is committed to the repository and visible to all contributors
- This policy will be updated if our AI usage changes
