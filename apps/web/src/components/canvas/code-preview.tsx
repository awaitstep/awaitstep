import { useMemo, lazy, Suspense, useState, useEffect } from 'react'
import { generateWorkflow } from '@awaitstep/provider-cloudflare/codegen'
import type { WorkflowIR, WorkflowNode, Edge } from '@awaitstep/ir'
import { useWorkflowStore } from '../../stores/workflow-store'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

export function CodePreview() {
  const { metadata, nodes, edges } = useWorkflowStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const generatedCode = useMemo(() => {
    if (nodes.length === 0) return '// Drag nodes onto the canvas to generate code'

    try {
      const irNodes: WorkflowNode[] = nodes.map((n) => n.data.irNode)
      const irEdges: Edge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label as string | undefined,
      }))

      const targets = new Set(irEdges.map((e) => e.target))
      const roots = irNodes.filter((n) => !targets.has(n.id))
      let entryNodeId = roots[0]?.id ?? irNodes[0]?.id ?? ''
      if (roots.length > 1) {
        const adj = new Map<string, string[]>()
        for (const n of irNodes) adj.set(n.id, [])
        for (const e of irEdges) adj.get(e.source)?.push(e.target)
        let best = 0
        for (const r of roots) {
          const visited = new Set<string>()
          const q = [r.id]
          while (q.length > 0) { const id = q.shift()!; if (!visited.has(id)) { visited.add(id); for (const n of adj.get(id) ?? []) q.push(n) } }
          if (visited.size > best) { best = visited.size; entryNodeId = r.id }
        }
      }

      const ir: WorkflowIR = {
        metadata,
        nodes: irNodes,
        edges: irEdges,
        entryNodeId,
      }

      return generateWorkflow(ir)
    } catch (err) {
      return `// Error generating code:\n// ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }, [metadata, nodes, edges])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Output</span>
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/40">TypeScript</span>
      </div>
      <div className="flex-1">
        {mounted ? (
          <Suspense
            fallback={
              <pre className="p-4 text-[12px] leading-[1.7] text-white/70">{generatedCode}</pre>
            }
          >
            <MonacoEditor
              height="100%"
              language="typescript"
              value={generatedCode}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 11,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: 'none',
                scrollbar: { vertical: 'auto', horizontal: 'hidden', verticalScrollbarSize: 6 },
                lineNumbersMinChars: 3,
                folding: false,
                glyphMargin: false,
                domReadOnly: true,
                cursorStyle: 'line-thin',
              }}
              beforeMount={(monaco) => {
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                  noSemanticValidation: true,
                  noSyntaxValidation: true,
                })
              }}
            />
          </Suspense>
        ) : (
          <pre className="p-4 text-[12px] leading-[1.7] text-white/70">{generatedCode}</pre>
        )}
      </div>
    </div>
  )
}
