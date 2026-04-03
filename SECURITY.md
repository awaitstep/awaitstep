# Security Policy

## Supported Versions

AwaitStep follows a rolling release model. Only the latest release on `main` receives security fixes.

| Version          | Supported |
| ---------------- | --------- |
| Latest on `main` | Yes       |
| Older releases   | No        |

## Reporting a Vulnerability

### Where to Report

Use [GitHub Security Advisories](https://github.com/awaitstep/awaitstep/security/advisories/new) to report vulnerabilities privately.

**Do NOT open a public issue for security vulnerabilities.**

### What to Include

- Description of the vulnerability
- Steps to reproduce or proof of concept
- Affected component (API, web app, codegen, provider, etc.)
- Impact assessment (what an attacker could achieve)

### Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 7 days
- **Fix or mitigation:** within 30 days for confirmed vulnerabilities

Timelines may vary for complex issues. We will communicate updates through the advisory.

## What Qualifies as a Security Vulnerability

### In Scope

- Authentication or authorization bypasses
- Injection vulnerabilities (SQL, XSS, command injection)
- Credential or secret exposure
- Cryptographic weaknesses
- Cross-site request forgery (CSRF)
- Server-side request forgery (SSRF)
- Privilege escalation
- Remote code execution on the AwaitStep server

### Out of Scope

Report these as regular bugs, not security vulnerabilities:

- Denial of service via resource exhaustion (unless trivially exploitable)
- Issues requiring physical access to the server
- Social engineering attacks
- Vulnerabilities in dependencies with no demonstrated impact on AwaitStep
- Issues in user-deployed Cloudflare Workers (user's own sandbox)
- Missing security headers with no demonstrated exploit path

## Security Practices

AwaitStep is built with security as a core concern:

- **Input validation** — All user input validated with strict schemas (Zod)
- **SQL injection prevention** — Parameterized database queries exclusively (Drizzle ORM)
- **Encryption at rest** — Credentials and secrets encrypted with AES-256-GCM
- **Authentication** — Dual-mode: session-based (OAuth) and scoped API keys (SHA-256 hashed)
- **Authorization** — Ownership-based access control on all resources
- **Rate limiting** — Multi-tier rate limiting on all endpoints
- **CSRF protection** — Origin validation for session-based authentication
- **Safe process spawning** — Array-form execution with no shell injection vectors

## Scope

This policy covers the AwaitStep application code in this repository: the API server (`apps/api`), web frontend (`apps/web`), and all packages under `packages/`.

It does **not** cover:

- Third-party services (Cloudflare, GitHub, OAuth providers)
- User-deployed workflow code running in external sandboxes
- Self-hosted deployments with custom modifications

## Safe Harbor

We support responsible security research. If you act in good faith:

- We will not pursue legal action against you
- We will not file law enforcement complaints
- We will work with you to understand and resolve the issue

Good faith means: you do not access or modify other users' data, you do not degrade service availability, and you report findings promptly through the channels above.

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits via [GitHub Security Advisory](https://github.com/awaitstep/awaitstep/security/advisories/new) (private)
2. We acknowledge, investigate, and develop a fix
3. We coordinate a disclosure date with the reporter
4. Fix is released and the advisory is published
5. Reporter may publish their own writeup after the advisory is public

We aim to keep the window between report and public fix under 90 days.
