import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { CF_RUNTIME_DTS } from '../cf-runtime-dts'

/** The diagnostics of `source` type-checked against the editor's Cloudflare declarations. */
function diagnosticsOf(source: string): string[] {
  const files = new Map([
    ['/cf-runtime.d.ts', CF_RUNTIME_DTS],
    ['/handler.ts', source],
  ])
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    strict: true,
    noEmit: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const read = host.getSourceFile.bind(host)
  host.getSourceFile = (name, version) => {
    const text = files.get(name)
    return text !== undefined ? ts.createSourceFile(name, text, version) : read(name, version)
  }
  host.fileExists = (name) => files.has(name) || ts.sys.fileExists(name)
  const program = ts.createProgram([...files.keys()], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === '/handler.ts')
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}

describe('CF_RUNTIME_DTS', () => {
  it('types the handler arguments the generated worker.ts uses', () => {
    // The shapes the bootstrap writes; before these were declared the editor
    // underlined ExecutionContext, MessageBatch and ScheduledController.
    const source = `
export default {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) => {
    ctx.waitUntil(Promise.resolve());
    ctx.passThroughOnException();
    return new Response(request.url);
  },
  async queue(batch: MessageBatch<{ id: number }>, env: unknown, ctx: ExecutionContext) {
    const queue: string = batch.queue;
    for (const message of batch.messages) {
      const id: number = message.body.id;
      void [queue, id, message.attempts];
      message.ack();
    }
    batch.retryAll({ delaySeconds: 5 });
  },
  scheduled: (controller: ScheduledController, env: unknown, ctx: ExecutionContext) => {
    const cron: string = controller.cron;
    const at: number = controller.scheduledTime;
    void [cron, at];
  },
};
`
    expect(diagnosticsOf(source)).toEqual([])
  })

  it('still refuses a misuse, so the declarations are actually read', () => {
    expect(diagnosticsOf('const ctx = {} as ExecutionContext;\nctx.waitUntil(1);')).not.toEqual([])
  })
})
