# Architecture

AwaitStep is a visual builder that compiles a canvas into one of two Cloudflare artifact kinds — **workflows** (durable, instance-based, `WorkflowEntrypoint`) or **functions** (stateless, fetch-only Workers). The system is divided into four layers: a browser-based frontend, an edge API, a set of shared packages, and the runtime that executes deployed artifacts.

## System Overview

```mermaid
graph TD
    subgraph Browser
        Canvas["Canvas (XYFlow)"]
        ConfigPanel["Config Panel"]
        EditorPanel["Code / IR Editor"]
    end

    subgraph API ["Edge API"]
        Routes["API Routes"]
        SSE["SSE Stream (deploy progress)"]
    end

    subgraph Packages
        IR["@awaitstep/ir<br/>(types · validation · expressions)"]
        Codegen["@awaitstep/codegen<br/>(code generation · transpile)"]
        ProviderCF["@awaitstep/provider-cloudflare<br/>(deploy · run · bindings)"]
        DB["@awaitstep/db<br/>(schema · queries)"]
    end

    subgraph Runtime ["Cloudflare Runtime"]
        Worker["CF Worker (generated)"]
        WF["CF Workflows engine"]
    end

    Canvas -->|WorkflowIR| Routes
    Routes --> IR
    IR --> Codegen
    Codegen --> ProviderCF
    ProviderCF -->|wrangler deploy| Worker
    Worker --> WF
    Routes --> SSE
    Routes --> DB
```

## Package Dependency Flow

Packages follow a strict one-way dependency graph. No circular dependencies are permitted.

```mermaid
graph LR
    IR["@awaitstep/ir"] --> Codegen["@awaitstep/codegen"]
    Codegen --> CF["@awaitstep/provider-cloudflare"]
    DB["@awaitstep/db"] -.->|standalone| API
    Auth["@awaitstep/auth"] -.->|standalone| API
    CF --> API["apps/api"]
    IR --> API
```

- `@awaitstep/ir` — Core IR types, Zod schemas, expression parser, IR validation, node registry, and all 12 built-in node definitions.
- `@awaitstep/codegen` — `CodeGenerator` interface, `WorkflowProvider` interface, DAG traversal, variable name sanitization, TypeScript transpilation.
- `@awaitstep/provider-cloudflare` — Concrete `WorkflowProvider` implementation for Cloudflare. Handles code generation, binding detection, wrangler-based deploy, run management, and local dev.
- `@awaitstep/db` — Drizzle ORM schema and query helpers. Standalone; no dependency on IR or codegen.
- `@awaitstep/auth` — Authentication utilities. Standalone.

## Provider Model

The `WorkflowProvider` interface in `@awaitstep/codegen` abstracts over execution backends. A provider must implement:

| Method                                  | Purpose                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `validate(ir)`                          | Validate the IR against provider-specific constraints  |
| `generate(ir, config)`                  | Produce a `GeneratedArtifact` (source + compiled code) |
| `deploy(artifact, config)`              | Deploy the artifact to the target platform             |
| `trigger(deploymentId, params, config)` | Start a new workflow run                               |
| `getStatus(instanceId, config)`         | Poll the status of a run                               |
| `destroy(deploymentId, config)`         | Delete a deployed workflow                             |

Adding a new provider (e.g., Inngest, Temporal) only requires a new `packages/provider-*` package that implements this interface.

## Data Flow

1. The user builds an artifact on the canvas. Every change is serialized to an `ArtifactIR` (`WorkflowIR | ScriptIR`) and saved via the API.
2. On deploy, the API passes the IR to `@awaitstep/ir` for validation, then to the provider's `generate()` method. The provider dispatches on `ir.kind`: workflows compile to a `WorkflowEntrypoint` class with `step.do()` wrappers; scripts compile to a fetch handler that calls a generated `runGraph(env, event)` function.
3. The provider transpiles the TypeScript to JavaScript, detects required Cloudflare bindings, writes a `wrangler.json` (with or without a `[[workflows]]` table depending on kind), and runs `wrangler deploy` in a temp directory.
4. Deploy progress is streamed back to the browser via Server-Sent Events (SSE).
5. At runtime, Cloudflare executes the generated Worker. Workflows go through the Workflows engine with durable state; scripts respond directly to incoming HTTP requests with no persistent state.

## Key Design Decisions

**IR as the source of truth.** Generated code is never stored in the database. The IR is the only persistent representation of an artifact. Code is regenerated on every deploy.

**Single graph, two artifact kinds.** Workflows and functions share the same node graph and the same per-node generators. Only the wrapper differs — `WorkflowEntrypoint` class vs `export default { fetch }` — and a small set of nodes (`sleep`, `sleep_until`, `wait_for_event`) are rejected for scripts at validation time.

**Provider isolation.** All Cloudflare-specific logic lives in `@awaitstep/provider-cloudflare`. API routes call `WorkflowProvider` methods — they never import from the provider package directly.

**Web-API-only templates.** Custom node templates for Cloudflare must use Web APIs only (`fetch`, `crypto`, `URL`, etc.). No Node.js APIs. This ensures templates run correctly in V8 isolates.

**Throw on errors.** Node templates must throw on failure. For workflows, the platform wraps every node in `step.do()`, which handles retries automatically when an error is thrown. For scripts, errors propagate to the fetch handler and become 500 responses unless caught by user `triggerCode`.
