---
title: Introduction
---

# Introduction

AwaitStep is a self-hosted visual builder for durable **Workflows** (multi-step, instance-based) and **Functions** (stateless, request-scoped). You design both on the same canvas with the same node graph, and AwaitStep compiles each to portable TypeScript — no vendor lock-in, no proprietary runtime.

The default codegen is provider-neutral: a workflow compiles to an `awaitstep/workflow.ts` module that imports `#awaitstep/runtime` and names no deploy target. A provider adapter wraps that module in its own bootstrap. Cloudflare is the first adapter; the same generated workflow module is what another adapter will run.

## What problem does it solve?

Writing durable workflow code by hand is tedious: retries, waits, branching, and state all have to be wired correctly. AwaitStep gives you a visual canvas where you wire together nodes (HTTP requests, AI calls, database queries, custom logic, and more), then handles code generation, type checking, and deployment to the provider you connect.

## Who is it for?

- Teams who want durable workflows without writing the structural plumbing by hand
- Developers who prefer visual composition for multi-step processes
- Anyone who wants to own their workflow infrastructure without a SaaS dependency

## What AwaitStep is NOT

- **Not no-code.** You still write expressions, secrets, and custom logic in TypeScript. AwaitStep generates the structural plumbing.
- **Not a proprietary engine.** Your workflows compile to portable TypeScript — readable in full in the browser IDE and through the API at any time, and yours to run where you deploy it.
- **Not the runtime.** AwaitStep does not run your workflows. The connected provider does. AwaitStep is a build and deploy tool.

## How it works

1. **Canvas** — Drag nodes onto the canvas and connect them to define your workflow logic.
2. **IR** — The canvas is serialized to an Intermediate Representation (a JSON document describing your workflow).
3. **Codegen** — AwaitStep compiles the IR to a provider-neutral `awaitstep/workflow.ts` plus one module per node.
4. **Deploy** — A provider adapter adds its bootstrap and deploy configuration. Cloudflare is the adapter shipped today: the bundle is deployed with `wrangler` to your Cloudflare account. <Badge type="warning" text="Cloudflare Only" />

Your workflow then runs entirely with the provider you deployed to — AwaitStep is not in the execution path.

## Workflows vs Functions

AwaitStep produces two artifact kinds from the same canvas:

- **Workflows** — durable, multi-step, instance-based. Compile to a provider-neutral `defineWorkflow` module. Support `sleep`, `sleep_until`, `wait_for_event`, runs/pause/resume/terminate, and the full [run lifecycle](/concepts/run-lifecycle).
- **Functions** (`kind: "script"`) — stateless, request-scoped. Compile to a portable `runGraph` module plus a provider fetch handler. Each HTTP request is a fresh invocation, no instance lifecycle, no Runs tab. Designed for webhooks, HTTP proxies, and transform-and-forward request handlers.

The discriminator is the `kind` field on the IR. See [Workflow IR](/concepts/workflow-ir#scripts-vs-workflows) for the type-level split and constraints.

## Key features

- Visual canvas with a library of built-in and community nodes
- Provider-neutral TypeScript codegen, with a provider flavor you can preview in the IDE
- One-click deploy to a connected provider <Badge type="warning" text="Cloudflare Only" />
- Secret management with binding injection
- KV, D1, R2, Queues, and AI bindings <Badge type="warning" text="Cloudflare Only" />
- Self-hosted with Docker — your data never leaves your infrastructure
- SQLite (zero-config) or PostgreSQL database backends
- Magic link, GitHub OAuth, and Google OAuth authentication
