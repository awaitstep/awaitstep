---
title: Introduction
---

# Introduction

AwaitStep is a self-hosted visual workflow builder for [Cloudflare Workflows](https://developers.cloudflare.com/workflows/). You design durable, multi-step workflows on a canvas, and AwaitStep compiles them to production-ready TypeScript that runs natively on your Cloudflare account — no vendor lock-in, no proprietary runtime.

## What problem does it solve?

Cloudflare Workflows is a powerful primitive for durable execution, but writing and maintaining workflow code by hand is tedious. AwaitStep gives you a visual canvas where you wire together nodes (HTTP requests, AI calls, database queries, custom logic, and more), then handles code generation, type checking, and deployment automatically.

## Who is it for?

- Teams who want durable workflows on Cloudflare without writing boilerplate
- Developers who prefer visual composition for multi-step processes
- Anyone who wants to own their workflow infrastructure without a SaaS dependency

## What AwaitStep is NOT

- **Not no-code.** You still write expressions, secrets, and custom logic in TypeScript. AwaitStep generates the structural plumbing.
- **Not a proprietary engine.** Your workflows compile to standard Cloudflare Workflows TypeScript. You can eject and maintain the code yourself at any time.
- **Not the runtime.** AwaitStep does not run your workflows. Cloudflare runs them. AwaitStep is a build and deploy tool.

## How it works

1. **Canvas** — Drag nodes onto the canvas and connect them to define your workflow logic.
2. **IR** — The canvas is serialized to an Intermediate Representation (a JSON document describing your workflow).
3. **Codegen** — AwaitStep compiles the IR to TypeScript source code targeting the Cloudflare Workflows API.
4. **Deploy** — The generated code is bundled with `wrangler` and deployed to your Cloudflare account.

Your workflow then runs entirely within Cloudflare — AwaitStep is not in the execution path.

## Key features

- Visual canvas with a library of built-in and community nodes
- Automatic TypeScript codegen targeting Cloudflare Workflows
- One-click deploy via `wrangler`
- Secret management with binding injection
- Support for KV, D1, R2, Queues, and AI bindings
- Self-hosted with Docker — your data never leaves your infrastructure
- SQLite (zero-config) or PostgreSQL database backends
- Magic link, GitHub OAuth, and Google OAuth authentication
