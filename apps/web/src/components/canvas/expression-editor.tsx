import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Braces } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import type { editor } from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { computeUpstreamSets } from '../../lib/expressions/upstream'
import {
  flattenOutputPaths,
  type ExpressionEditorContext,
} from '../../lib/expressions/editor-support'
import {
  EXPRESSION_LANGUAGE_ID,
  clearExpressionContext,
  clearExpressionMarkers,
  configureExpressionLanguage,
  setExpressionContext,
  validateExpressionModel,
} from '../../lib/monaco/expression-language'
import { debounce } from '../../lib/debounce'
import { cn } from '../../lib/utils'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

const EXPRESSION_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 12,
  lineNumbers: 'off',
  folding: false,
  minimap: { enabled: false },
  wordWrap: 'off',
  scrollBeyondLastLine: false,
  scrollBeyondLastColumn: 2,
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { vertical: 'hidden', horizontal: 'auto', horizontalScrollbarSize: 4 },
  glyphMargin: false,
  lineDecorationsWidth: 6,
  contextmenu: false,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  // Suggest/hover widgets must escape the 30px-tall container.
  fixedOverflowWidgets: true,
  automaticLayout: true,
  padding: { top: 6, bottom: 6 },
}

interface ExpressionEditorProps {
  value: string
  onChange: (value: string) => void
  /** The node whose config field this is — scopes upstream refs. */
  nodeId: string
  placeholder?: string
}

/**
 * Compact Monaco field for `{{node.path}}` expressions: typed completions
 * and hovers from upstream outputSchemas, inline squiggles from the same
 * validator the workflow panel uses, and an insert-binding picker.
 */
export function ExpressionEditor({ value, onChange, nodeId, placeholder }: ExpressionEditorProps) {
  const [mounted, setMounted] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const pendingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)

  const irNodes = useWorkflowStore(useShallow((s) => s.nodes.map((n) => n.data.irNode)))
  const edges = useWorkflowStore((s) => s.edges)
  const { registry } = useNodeRegistry()

  const ctx = useMemo<ExpressionEditorContext>(() => {
    const upstream =
      computeUpstreamSets(
        irNodes.map((n) => ({ id: n.id })),
        edges.map((e) => ({ source: e.source, target: e.target })),
      ).get(nodeId) ?? new Set<string>()
    return {
      nodeId,
      nodes: irNodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
      upstream,
      resolveDefinition: (nodeType) => registry.get(nodeType),
    }
  }, [irNodes, edges, nodeId, registry])
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useEffect(() => {
    setMounted(true)
  }, [])

  const debouncedOnChange = useMemo(
    () =>
      debounce((v: string) => {
        pendingRef.current = false
        onChangeRef.current(v)
      }, 300),
    [],
  )
  useEffect(() => () => debouncedOnChange.cancel(), [debouncedOnChange])
  useEffect(() => {
    if (!pendingRef.current) setLocalValue(value)
  }, [value])

  const handleChange = useCallback(
    (v: string | undefined) => {
      const next = v ?? ''
      setLocalValue(next)
      pendingRef.current = true
      debouncedOnChange(next)
      // Squiggles track keystrokes, not just context changes.
      const monaco = monacoRef.current
      const model = editorRef.current?.getModel()
      if (monaco && model) validateExpressionModel(monaco, model, ctxRef.current)
    },
    [debouncedOnChange],
  )

  // Push context updates (canvas edits while the field is open) to the
  // language providers and refresh squiggles.
  useEffect(() => {
    const instance = editorRef.current
    const monaco = monacoRef.current
    const model = instance?.getModel()
    if (!monaco || !model) return
    setExpressionContext(model.uri.toString(), ctx)
    validateExpressionModel(monaco, model, ctx)
  }, [ctx])

  // Dispose the model registration exactly once on unmount.
  useEffect(
    () => () => {
      const instance = editorRef.current
      const monaco = monacoRef.current
      const model = instance?.getModel()
      if (monaco && model) {
        clearExpressionContext(model.uri.toString())
        clearExpressionMarkers(monaco, model)
      }
    },
    [],
  )

  const handleMount = useCallback((instance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = instance
    monacoRef.current = monaco
    const model = instance.getModel()
    if (!model) return
    setExpressionContext(model.uri.toString(), ctxRef.current)
    validateExpressionModel(monaco, model, ctxRef.current)
    // Single-line field: Enter never inserts a newline; the suggest widget
    // still accepts with Enter because its keybinding has priority context.
    instance.addCommand(monaco.KeyCode.Enter, () => {}, '!suggestWidgetVisible')
  }, [])

  const insertBinding = useCallback((expression: string) => {
    const instance = editorRef.current
    if (!instance) return
    const selection = instance.getSelection()
    const model = instance.getModel()
    if (!selection || !model) return
    instance.executeEdits('binding-picker', [{ range: selection, text: expression }])
    instance.focus()
  }, [])

  const pickerNodes = useMemo(
    () =>
      ctx.nodes.filter(
        (n) => n.id !== nodeId && ctx.upstream.has(n.id) && /^[A-Za-z0-9_]+$/.test(n.id),
      ),
    [ctx, nodeId],
  )

  if (!mounted) {
    return <div className="h-[30px] rounded-md border border-input bg-[oklch(0.12_0_0)]" />
  }

  return (
    <div className="group relative" onKeyDown={(e) => e.stopPropagation()}>
      <div className="h-[30px] overflow-hidden rounded-md border border-input">
        <Suspense fallback={<div className="h-full bg-[oklch(0.12_0_0)]" />}>
          <MonacoEditor
            height="100%"
            language={EXPRESSION_LANGUAGE_ID}
            value={localValue}
            onChange={handleChange}
            theme="vs-dark"
            beforeMount={configureExpressionLanguage}
            onMount={handleMount}
            options={EXPRESSION_EDITOR_OPTIONS}
          />
        </Suspense>
      </div>
      {localValue === '' && placeholder && (
        <span className="pointer-events-none absolute left-2.5 top-1.5 font-mono text-xs text-muted-foreground/40">
          {placeholder}
        </span>
      )}
      <BindingPicker nodes={pickerNodes} resolve={ctx.resolveDefinition} onInsert={insertBinding} />
    </div>
  )
}

function BindingPicker({
  nodes,
  resolve,
  onInsert,
}: {
  nodes: { id: string; name: string; type: string }[]
  resolve: ExpressionEditorContext['resolveDefinition']
  onInsert: (expression: string) => void
}) {
  const [open, setOpen] = useState(false)

  const handleInsert = useCallback(
    (expression: string) => {
      onInsert(expression)
      setOpen(false)
    },
    [onInsert],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Insert binding"
          className={cn(
            'absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded',
            'text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted/60',
            'hover:text-foreground group-hover:opacity-100',
            open && 'opacity-100',
          )}
        >
          <Braces className="h-3 w-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-50 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {nodes.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground/60">
              No upstream nodes to reference yet.
            </p>
          ) : (
            nodes.map((node) => {
              const paths = flattenOutputPaths(resolve(node.type)?.outputSchema)
              return (
                <div key={node.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => handleInsert(`{{${node.id}}}`)}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-muted/60"
                  >
                    <span className="text-xs font-medium text-foreground/80">{node.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground/50">
                      {node.id}
                    </span>
                  </button>
                  {paths.map((p) => (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => handleInsert(`{{${node.id}${p.path}}}`)}
                      title={p.description}
                      className="flex w-full items-baseline gap-2 rounded py-0.5 pl-6 pr-2 text-left hover:bg-muted/60"
                    >
                      <span className="font-mono text-xs text-foreground/70">{p.path}</span>
                      <span className="truncate text-xs text-muted-foreground/50">{p.type}</span>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
