---
title: Adding Providers
---

# Adding Providers

A **provider** is a workflow execution backend. AwaitStep currently ships with the `cloudflare` provider. This guide explains how to add support for a new provider (e.g. Inngest, Temporal, AWS Step Functions).

## Overview

Adding a provider requires:

1. A new package `packages/provider-<name>` that implements the `CodeGenerator` interface
2. Node templates (`templates/<name>.ts`) in each node directory
3. Registration of the provider in the app

## The CodeGenerator interface

```typescript
// packages/codegen/src/code-generator.ts
interface CodeGenerator {
  readonly name: string
  generateWorkflow(ir: WorkflowIR): string
}
```

Your provider package must export a class or object implementing this interface.

## The WorkflowProvider interface

Provider packages also implement deployment and run-management operations via a `WorkflowProvider` interface. This is what API routes call — adding a new provider must not require changes to API route files.

```typescript
interface WorkflowProvider {
  // Code generation
  generateCode(ir: WorkflowIR): string

  // Deploy lifecycle
  deploy(params: DeployParams): Promise<DeployResult>
  takedown(params: TakedownParams): Promise<void>
  verifyCredentials(credentials: unknown): Promise<VerifyResult>

  // Run control
  triggerRun(params: TriggerParams): Promise<TriggerResult>
  getRun(params: GetRunParams): Promise<RunStatus>
  pauseRun(params: RunControlParams): Promise<void>
  resumeRun(params: RunControlParams): Promise<void>
  terminateRun(params: RunControlParams): Promise<void>
}
```

The exact interface is defined in `packages/codegen/src/provider.ts`. Import it from `@awaitstep/codegen`.

## Step-by-step

### 1. Create the package

```bash
mkdir -p packages/provider-myruntime/src
cd packages/provider-myruntime
```

Create `package.json`:

```json
{
  "name": "@awaitstep/provider-myruntime",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts",
    "test": "vitest run",
    "lint": "eslint src",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@awaitstep/codegen": "workspace:*",
    "@awaitstep/ir": "workspace:*"
  }
}
```

Create `tsconfig.json` extending the shared config:

```json
{
  "extends": "../../tooling/tsconfig/base.json",
  "include": ["src"]
}
```

### 2. Implement the code generator

```typescript
// packages/provider-myruntime/src/codegen/generate.ts
import type { WorkflowIR } from '@awaitstep/ir'
import type { CodeGenerator } from '@awaitstep/codegen'

export class MyRuntimeCodeGenerator implements CodeGenerator {
  readonly name = 'myruntime'

  generateWorkflow(ir: WorkflowIR): string {
    // Generate executable code for your runtime from the IR
    const steps = ir.nodes.map((node) => this.generateNode(node, ir))
    return this.buildEntrypoint(ir.metadata.name, steps)
  }

  private generateNode(node: WorkflowNode, ir: WorkflowIR): string {
    switch (node.type) {
      case 'step':
        return this.generateStep(node)
      case 'sleep':
        return this.generateSleep(node)
      // ... handle each node type
      default:
        throw new Error(`Unsupported node type: ${node.type}`)
    }
  }

  private generateStep(node: WorkflowNode): string {
    // Return the runtime-specific code for a step
    return `await myruntime.run("${node.name}", async () => { ${node.data.code} });`
  }

  private generateSleep(node: WorkflowNode): string {
    return `await myruntime.sleep("${node.name}", "${node.data.duration}");`
  }

  private buildEntrypoint(name: string, steps: string[]): string {
    return `
export const ${name}Workflow = myruntime.createWorkflow(async (step) => {
  ${steps.join('\n  ')}
});
    `.trim()
  }
}
```

### 3. Implement the WorkflowProvider

```typescript
// packages/provider-myruntime/src/provider.ts
import type { WorkflowProvider } from '@awaitstep/codegen'

export class MyRuntimeProvider implements WorkflowProvider {
  constructor(private credentials: { apiKey: string }) {}

  generateCode(ir: WorkflowIR): string {
    return new MyRuntimeCodeGenerator().generateWorkflow(ir)
  }

  async deploy(params: DeployParams): Promise<DeployResult> {
    // Call your runtime's deploy API
  }

  async triggerRun(params: TriggerParams): Promise<TriggerResult> {
    // Call your runtime's trigger API
  }

  // ... implement remaining methods
}
```

### 4. Export from the package

```typescript
// packages/provider-myruntime/src/index.ts
export { MyRuntimeProvider } from './provider.js'
export { MyRuntimeCodeGenerator } from './codegen/generate.js'
```

### 5. Add node templates

For each node in `nodes/`, add a `templates/myruntime.ts` file using the runtime-specific SDK:

```typescript
// nodes/http_request/templates/myruntime.ts
import type { NodeContext } from '@awaitstep/node-sdk'

export default async function (ctx: NodeContext<Config>): Promise<Output> {
  // Same business logic — just runs in a different runtime context
  const res = await fetch(ctx.config.url, { method: ctx.config.method })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { status: res.status, body: await res.text(), headers: {} }
}
```

Add `"myruntime"` to the `providers` array in each node's `node.json`.

### 6. Register the provider

In `apps/api/src/index.ts`, register the new provider so the app can use it:

```typescript
import { MyRuntimeProvider } from '@awaitstep/provider-myruntime'

// In the provider factory:
case 'myruntime':
  return new MyRuntimeProvider(connection.credentials)
```

### 7. Add tests

Write tests for the code generator covering all node types. See `packages/provider-cloudflare/src/codegen/__tests__/` for examples.

## Provider-specific logic rule

All provider-specific logic (API calls, credential checks, deploy validation) must live in `packages/provider-<name>`. API routes call methods on the `WorkflowProvider` interface only. Never add provider-specific code to API route files.
