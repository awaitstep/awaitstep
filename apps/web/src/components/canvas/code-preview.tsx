import { lazy, Suspense } from 'react'
import { AlertTriangle, Code2, Copy, X } from 'lucide-react'
import { actionToast } from '../../lib/action-toast'
import { fileLanguage } from '../../lib/ide/file-tree'
import { copyToClipboard } from '../../lib/utils'
import { READONLY_EDITOR_OPTIONS } from '../../lib/monaco/options'
import { configureMonaco } from '../../lib/monaco/setup'
import { useMonacoTheme } from '../../lib/monaco/theme'
import { useGeneratedEntry } from '../../hooks/use-generated-entry'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

interface CodePreviewProps {
  onClose: () => void
}

/**
 * The generated graph module, read-only, in a panel beside the canvas.
 *
 * It is generated from the graph on screen, so it moves with the canvas rather
 * than with the last save. It is always the provider-neutral
 * `awaitstep/workflow.ts` / `awaitstep/function.ts`; deploy entries and
 * platform adapters are not shown here.
 *
 * The editor gets its own model, not the code workspace's project model: this
 * is a detached view of one generated file, and the workspace's language
 * service owns the live project. Unresolved imports stay quiet through the
 * shared Monaco configuration, which mutes the "cannot find module" class for
 * code that is shown outside the project.
 */
export function CodePreview({ onClose }: CodePreviewProps) {
  const monacoTheme = useMonacoTheme()
  const { path, source, error } = useGeneratedEntry()

  function handleCopy() {
    if (source === null) return
    void copyToClipboard(source)
      .then(() => actionToast.success('Code copied'))
      .catch(() => actionToast.error('Couldn’t copy the code'))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-2xs font-medium uppercase tracking-wider text-foreground">
            Code preview
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {source !== null && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy the generated code"
              className="inline-flex h-6 items-center gap-1.5 rounded px-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Hide code preview"
            aria-label="Hide code preview"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {path !== null && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1 text-2xs text-muted-foreground">
          <span className="truncate font-mono">{path}</span>
          <span className="shrink-0 uppercase tracking-wider text-muted-foreground/70">
            Read-only
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {error !== null ? (
          <PreviewMessage
            icon={<AlertTriangle className="mb-1 h-5 w-5 text-status-warning/60" />}
            title="Couldn’t generate code"
            body={error}
          />
        ) : path === null ? (
          <PreviewMessage
            icon={<Code2 className="mb-1 h-5 w-5 text-muted-foreground/30" />}
            title="Nothing to preview yet"
            body="Add a step to the canvas to see the code it generates."
          />
        ) : source === null ? (
          <PreviewMessage
            icon={<Code2 className="mb-1 h-5 w-5 text-muted-foreground/30" />}
            title="No generated code"
            body={`The generated bundle has no ${path}.`}
          />
        ) : (
          <Suspense fallback={<div className="h-full bg-editor" />}>
            <MonacoEditor
              height="100%"
              // A model of its own: the code workspace's model for this path is
              // the saved project, not this live preview.
              path={`inmemory://code-preview/${encodeURIComponent(path)}`}
              language={fileLanguage(path)}
              value={source}
              theme={monacoTheme}
              options={{ ...READONLY_EDITOR_OPTIONS, ariaLabel: 'Generated code' }}
              saveViewState={false}
              beforeMount={configureMonaco}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

function PreviewMessage({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      {icon}
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="max-w-md break-words text-2xs text-muted-foreground">{body}</p>
    </div>
  )
}
