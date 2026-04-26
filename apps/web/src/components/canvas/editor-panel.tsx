import { useMemo, useCallback, lazy, Suspense, useState, useEffect, useRef } from 'react'
import {
  generateScript,
  generateWorkflow,
  DEFAULT_TRIGGER_CODE,
  DEFAULT_SCRIPT_TRIGGER_CODE,
} from '@awaitstep/provider-cloudflare/codegen'
import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import { Copy, Check, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { useOrgStore } from '../../stores/org-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
import { buildIRFromState } from '../../lib/build-ir'
import { cn, copyToClipboard } from '../../lib/utils'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

type Tab = 'code' | 'preview'
type OutputMode = 'typescript' | 'ir-json'

export function EditorPanel() {
  const { kind, metadata, nodes, edges, triggerCode, dependencies } = useWorkflowStore(
    useShallow((s) => ({
      kind: s.kind,
      metadata: s.metadata,
      nodes: s.nodes,
      edges: s.edges,
      triggerCode: s.triggerCode,
      dependencies: s.dependencies,
    })),
  )
  const { setTriggerCode, setDependencies } = useWorkflowStore()

  const [tab, setTab] = useState<Tab>('preview')
  const [outputMode, setOutputMode] = useState<OutputMode>('typescript')
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [packagesOpen, setPackagesOpen] = useState(false)
  const templatesRef = useRef<Record<string, Record<string, string>>>({})
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const organizationId = useOrgStore((s) => s.activeOrganizationId)

  useEffect(() => {
    setMounted(true)
    const params = organizationId ? `?organizationId=${organizationId}` : ''
    fetch(`/api/nodes/templates${params}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, Record<string, string>> | null) => {
        if (data) templatesRef.current = data
        setTemplatesLoaded(true)
      })
      .catch(() => setTemplatesLoaded(true))
  }, [organizationId])

  const ir = useMemo(() => {
    if (nodes.length === 0) return null
    return buildIRFromState({ metadata, nodes, edges, kind })
  }, [metadata, nodes, edges, kind])

  const templateResolver = useMemo<TemplateResolver>(
    () => ({
      getTemplate(nodeType: string, provider: string): string | undefined {
        return templatesRef.current[nodeType]?.[provider]
      },
    }),
    [templatesLoaded],
  )

  const generatedCode = useMemo(() => {
    if (!ir) return '// Drag nodes onto the canvas to generate code'
    try {
      if (kind === 'script') {
        const scriptIr: ScriptIR = {
          ...(ir as WorkflowIR),
          kind: 'script',
          trigger: { type: 'http' },
        }
        return generateScript(scriptIr, {
          templateResolver,
          triggerCode: triggerCode || undefined,
          preview: true,
        })
      }
      return generateWorkflow(ir, {
        templateResolver,
        triggerCode: triggerCode || undefined,
        preview: true,
      })
    } catch (err) {
      return `// Error generating code:\n// ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }, [ir, kind, templateResolver, triggerCode])

  const irJson = useMemo(() => {
    if (!ir) return '// No workflow data'
    return JSON.stringify(ir, null, 2)
  }, [ir])

  const handleCopy = useCallback(async () => {
    const text =
      tab === 'preview'
        ? outputMode === 'typescript'
          ? generatedCode
          : irJson
        : triggerCode || (kind === 'script' ? DEFAULT_SCRIPT_TRIGGER_CODE : DEFAULT_TRIGGER_CODE)
    await copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [tab, outputMode, generatedCode, irJson, triggerCode, kind])

  const depsJson = useMemo(() => {
    if (Object.keys(dependencies).length === 0) return '{\n  \n}'
    return JSON.stringify(dependencies, null, 2)
  }, [dependencies])

  const depsCount = Object.keys(dependencies).length

  const handleDepsChange = useCallback(
    (value: string) => {
      try {
        const parsed = JSON.parse(value)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          setDependencies(parsed as Record<string, string>)
        }
      } catch {
        // Ignore invalid JSON while typing
      }
    },
    [setDependencies],
  )

  const isCustomEntry = triggerCode && triggerCode !== ''
  const isScript = kind === 'script'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'code', label: 'Code' },
    { id: 'preview', label: 'Preview' },
  ]

  // The graph outputs available to user-edited code via `graph.X`. Mirrors the
  // names emitted by `generateScript`'s runGraph return statement: nodes whose
  // bodies contain a `return` produce a varName.
  const graphOutputs = useMemo(() => {
    if (!isScript || !ir) return []
    const names: string[] = []
    for (const node of ir.nodes) {
      const data = (node as { data?: { code?: unknown } }).data
      const hasReturn =
        typeof data?.code === 'string' ? /\breturn\b/.test(data.code) : node.type !== 'step'
      if (hasReturn) names.push(node.name)
    }
    return names
  }, [isScript, ir])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-1">
          <div className="flex rounded-md bg-muted/50">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'bg-muted/70 text-foreground/60'
                    : 'text-muted-foreground/60 hover:text-muted-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Preview sub-tabs */}
          {tab === 'preview' && (
            <div className="flex rounded-md bg-muted/50">
              <button
                onClick={() => setOutputMode('typescript')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                  outputMode === 'typescript'
                    ? 'bg-muted/70 text-foreground/60'
                    : 'text-muted-foreground/60 hover:text-muted-foreground',
                )}
              >
                TypeScript
              </button>
              <button
                onClick={() => setOutputMode('ir-json')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
                  outputMode === 'ir-json'
                    ? 'bg-muted/70 text-foreground/60'
                    : 'text-muted-foreground/60 hover:text-muted-foreground',
                )}
              >
                IR JSON
              </button>
            </div>
          )}

          {/* Entry reset button */}
          {tab === 'code' && isCustomEntry && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setTriggerCode('')}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          )}

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Code tab: packages + entry editor */}
      {tab === 'code' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Collapsible packages section */}
          <div className="border-b border-border">
            <button
              onClick={() => setPackagesOpen(!packagesOpen)}
              className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {packagesOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Packages
              {depsCount > 0 && (
                <span className="rounded bg-muted/60 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground/60">
                  {depsCount}
                </span>
              )}
            </button>
            {packagesOpen && (
              <div className="border-t border-border">
                <div className="h-[120px]">
                  <EditableEditor
                    mounted={mounted}
                    value={depsJson}
                    onChange={handleDepsChange}
                    language="json"
                  />
                </div>
                <div className="px-4 py-1.5">
                  <p className="text-xs text-muted-foreground/40">
                    NPM packages installed at deploy time. Format:{' '}
                    <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
                      {'"package": "version"'}
                    </code>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Entry code hint */}
          <div className="border-b border-border px-4 py-2">
            {isScript ? (
              <p className="text-xs leading-relaxed text-muted-foreground/40">
                Body of{' '}
                <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">fetch()</code>.
                Graph nodes run inside{' '}
                <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
                  runGraph()
                </code>{' '}
                — call it and reference outputs via{' '}
                <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">graph.*</code>.
                {graphOutputs.length > 0 && (
                  <>
                    {' '}
                    Available:{' '}
                    {graphOutputs.map((name, i) => (
                      <span key={name}>
                        {i > 0 && ', '}
                        <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
                          graph.{name}
                        </code>
                      </span>
                    ))}
                    .
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground/40">
                Code for the{' '}
                <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">fetch()</code>{' '}
                handler. Write{' '}
                <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">import</code>{' '}
                statements at the top — they are hoisted automatically.
              </p>
            )}
          </div>

          {/* Entry code editor */}
          <div className="flex-1">
            <EditableEditor
              mounted={mounted}
              value={triggerCode || (isScript ? DEFAULT_SCRIPT_TRIGGER_CODE : DEFAULT_TRIGGER_CODE)}
              onChange={setTriggerCode}
              language="typescript"
            />
          </div>
        </div>
      )}

      {/* Preview tab */}
      {tab === 'preview' && (
        <div className="flex-1">
          <OutputEditor
            mounted={mounted}
            code={outputMode === 'typescript' ? generatedCode : irJson}
            language={outputMode === 'ir-json' ? 'json' : 'typescript'}
          />
        </div>
      )}
    </div>
  )
}

function OutputEditor({
  mounted,
  code,
  language,
}: {
  mounted: boolean
  code: string
  language: string
}) {
  if (!mounted) {
    return <pre className="p-4 text-xs leading-[1.7] text-foreground/70">{code}</pre>
  }

  return (
    <Suspense fallback={<pre className="p-4 text-xs leading-[1.7] text-foreground/70">{code}</pre>}>
      <MonacoEditor
        height="100%"
        language={language}
        value={code}
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
  )
}

function EditableEditor({
  mounted,
  value,
  onChange,
  language,
}: {
  mounted: boolean
  value: string
  onChange: (v: string) => void
  language: string
}) {
  if (!mounted) {
    return <div className="flex-1 bg-[oklch(0.12_0_0)]" />
  }

  return (
    <Suspense fallback={<div className="flex-1 bg-[oklch(0.12_0_0)]" />}>
      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        theme="vs-dark"
        options={{
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
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
        }}
        beforeMount={(monaco) => {
          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
          })
        }}
      />
    </Suspense>
  )
}
