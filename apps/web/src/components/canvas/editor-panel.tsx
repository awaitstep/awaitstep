import { useMemo, useCallback, lazy, Suspense, useState, useEffect, useRef } from 'react'
import { generateWorkflow, DEFAULT_TRIGGER_CODE } from '@awaitstep/provider-cloudflare/codegen'
import type { TemplateResolver } from '@awaitstep/codegen'
import { Copy, Check, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { useOrgStore } from '../../stores/org-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
import { buildIRFromState } from '../../lib/build-ir'
import { cn } from '../../lib/utils'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

type Tab = 'entry' | 'dependencies' | 'output'
type OutputMode = 'typescript' | 'ir-json'

export function EditorPanel() {
  const { metadata, nodes, edges, triggerCode, dependencies } = useWorkflowStore(
    useShallow((s) => ({
      metadata: s.metadata,
      nodes: s.nodes,
      edges: s.edges,
      triggerCode: s.triggerCode,
      dependencies: s.dependencies,
    })),
  )
  const { setTriggerCode, setDependencies } = useWorkflowStore()

  const [tab, setTab] = useState<Tab>('output')
  const [outputMode, setOutputMode] = useState<OutputMode>('typescript')
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
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
    return buildIRFromState({ metadata, nodes, edges })
  }, [metadata, nodes, edges])

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
      return generateWorkflow(ir, { templateResolver, triggerCode: triggerCode || undefined })
    } catch (err) {
      return `// Error generating code:\n// ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }, [ir, templateResolver, triggerCode])

  const irJson = useMemo(() => {
    if (!ir) return '// No workflow data'
    return JSON.stringify(ir, null, 2)
  }, [ir])

  const handleCopy = useCallback(async () => {
    const text =
      tab === 'output'
        ? outputMode === 'typescript'
          ? generatedCode
          : irJson
        : tab === 'entry'
          ? triggerCode || DEFAULT_TRIGGER_CODE
          : JSON.stringify(dependencies, null, 2)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [tab, outputMode, generatedCode, irJson, triggerCode, dependencies])

  const depsJson = useMemo(() => {
    if (Object.keys(dependencies).length === 0) return '{\n  \n}'
    return JSON.stringify(dependencies, null, 2)
  }, [dependencies])

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'entry', label: 'Entry' },
    { id: 'dependencies', label: 'Packages' },
    { id: 'output', label: 'Output' },
  ]

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
                  'rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors',
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
          {/* Output sub-tabs */}
          {tab === 'output' && (
            <div className="flex rounded-md bg-muted/50">
              <button
                onClick={() => setOutputMode('typescript')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
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
                  'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
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
          {tab === 'entry' && isCustomEntry && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
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

      {/* Tab hint */}
      {tab === 'entry' && (
        <div className="border-b border-border px-4 py-2">
          <p className="text-[10px] leading-relaxed text-muted-foreground/40">
            Code inside the{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">fetch()</code>{' '}
            handler. Has access to{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">request</code>,{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">env</code>, and{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">ctx</code>.
          </p>
        </div>
      )}
      {tab === 'dependencies' && (
        <div className="border-b border-border px-4 py-2">
          <p className="text-[10px] leading-relaxed text-muted-foreground/40">
            NPM packages installed at deploy time. Edit the JSON array below — each entry needs{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">name</code> and{' '}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">version</code>.
          </p>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1">
        {tab === 'output' && (
          <OutputEditor
            mounted={mounted}
            code={outputMode === 'typescript' ? generatedCode : irJson}
            language={outputMode === 'ir-json' ? 'json' : 'typescript'}
          />
        )}
        {tab === 'entry' && (
          <EditableEditor
            mounted={mounted}
            value={triggerCode || DEFAULT_TRIGGER_CODE}
            onChange={setTriggerCode}
            language="typescript"
          />
        )}
        {tab === 'dependencies' && (
          <EditableEditor
            mounted={mounted}
            value={depsJson}
            onChange={handleDepsChange}
            language="json"
          />
        )}
      </div>
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
    return <pre className="p-4 text-[12px] leading-[1.7] text-foreground/70">{code}</pre>
  }

  return (
    <Suspense
      fallback={<pre className="p-4 text-[12px] leading-[1.7] text-foreground/70">{code}</pre>}
    >
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
