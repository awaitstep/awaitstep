import { useMemo, useCallback, lazy, Suspense, useState, useEffect } from 'react'
import { generateWorkflow } from '@awaitstep/provider-cloudflare/codegen'
import type { WorkflowIR, WorkflowNode, Edge } from '@awaitstep/ir'
import { Copy, Check } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { cn } from '../../lib/utils'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

type ViewMode = 'typescript' | 'ir-json'

function buildIR(metadata: WorkflowIR['metadata'], nodes: { data: { irNode: WorkflowNode } }[], edges: { id: string; source: string; target: string; label?: React.ReactNode }[]): WorkflowIR | null {
  if (nodes.length === 0) return null

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

  return { metadata, nodes: irNodes, edges: irEdges, entryNodeId }
}

export function CodePreview() {
  const { metadata, nodes, edges } = useWorkflowStore()
  const [mounted, setMounted] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('typescript')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const ir = useMemo(() => buildIR(metadata, nodes, edges), [metadata, nodes, edges])

  const displayCode = useMemo(() => {
    if (!ir) return '// Drag nodes onto the canvas to generate code'

    if (viewMode === 'ir-json') {
      return JSON.stringify(ir, null, 2)
    }

    try {
      return generateWorkflow(ir)
    } catch (err) {
      return `// Error generating code:\n// ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }, [ir, viewMode])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(displayCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayCode])

  const language = viewMode === 'ir-json' ? 'json' : 'typescript'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/30">Output</span>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-md bg-white/[0.04]">
            <button
              onClick={() => setViewMode('typescript')}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
                viewMode === 'typescript' ? 'bg-white/[0.08] text-white/60' : 'text-white/30 hover:text-white/50',
              )}
            >
              TypeScript
            </button>
            <button
              onClick={() => setViewMode('ir-json')}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
                viewMode === 'ir-json' ? 'bg-white/[0.08] text-white/60' : 'text-white/30 hover:text-white/50',
              )}
            >
              IR JSON
            </button>
          </div>
          <button
            onClick={handleCopy}
            className="rounded-md p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <div className="flex-1">
        {mounted ? (
          <Suspense
            fallback={
              <pre className="p-4 text-[12px] leading-[1.7] text-white/70">{displayCode}</pre>
            }
          >
            <MonacoEditor
              height="100%"
              language={language}
              value={displayCode}
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
          <pre className="p-4 text-[12px] leading-[1.7] text-white/70">{displayCode}</pre>
        )}
      </div>
    </div>
  )
}
