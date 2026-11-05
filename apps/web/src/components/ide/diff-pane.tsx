import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { fileLanguage } from '../../lib/ide/file-tree'
import { searchSeedOf } from '../../lib/ide/editor-seed'
import { IDE_EDITOR_OPTIONS } from '../../lib/monaco/options'
import { configureMonaco, workflowModelPath } from '../../lib/monaco/setup'
import { useMonacoTheme } from '../../lib/monaco/theme'
import { useIdeStore } from '../../stores/ide-store'

const MonacoDiff = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
)

/** What the header drives in the diff. */
export interface DiffPaneApi {
  goToDiff: (direction: 'next' | 'previous') => void
  focus: () => void
}

interface DiffPaneProps {
  workflowId: string
  path: string
  /** The left side: saved text, or the server's copy. */
  original: string
  /** Keeps the left model apart: the saved text and the server's copy of one file never share one. */
  originalKind: 'saved' | 'server'
  /** The right side's text when the pane opens; after that the workspace's model owns it. */
  modified: string
  readOnly: boolean
  /** Takes the keyboard when nothing has it. Off for a pane that replaces another. */
  autoFocus?: boolean
  sideBySide: boolean
  /** Typing on the right side: the new full text. */
  onChange: (text: string) => void
  onApi: (api: DiffPaneApi | null) => void
  onChangeCount: (count: number) => void
}

const LANGUAGE_SERVICE_OWNERS = ['typescript', 'javascript']

/**
 * The left side is a TypeScript model so it is highlighted, which also hands
 * it to the language service: a relative import in the old text would not
 * resolve (its neighbours live under other URIs) and would paint red
 * squiggles on a read-only side. Its markers are cleared whenever they appear.
 * (Problems never counts them either: `collectProblems` takes workflow files only.)
 */
function hushLanguageMarkers(original: editor.ICodeEditor, monaco: Monaco) {
  const model = original.getModel()
  if (!model) return
  const key = model.uri.toString()
  function hush() {
    for (const owner of LANGUAGE_SERVICE_OWNERS) {
      if (monaco.editor.getModelMarkers({ owner, resource: model!.uri }).length > 0) {
        monaco.editor.setModelMarkers(model!, owner, [])
      }
    }
  }
  const subscription = monaco.editor.onDidChangeMarkers(
    (uris: readonly { toString(): string }[]) => {
      if (uris.some((uri: { toString(): string }) => uri.toString() === key)) hush()
    },
  )
  original.onDidDispose(() => subscription.dispose())
  hush()
}

function originalModelPath(kind: DiffPaneProps['originalKind'], workflowId: string, path: string) {
  return `awaitstep-${kind}://workflow/${encodeURIComponent(workflowId)}/${path}`
}

/**
 * Monaco's diff editor over one file. The right side is the workspace's own
 * model for the file, so typing there is typing in the file: the draft, the
 * tab's dot and the status bar follow, and undo history is shared with the
 * editor tab. The left side is a model of its own, disposed with the pane.
 *
 * Key the pane by file: a new file mounts a new pane, so the left model of
 * the previous one is always disposed.
 */
export function DiffPane({
  workflowId,
  path,
  original,
  originalKind,
  modified,
  readOnly,
  autoFocus = true,
  sideBySide,
  onChange,
  onApi,
  onChangeCount,
}: DiffPaneProps) {
  const theme = useMonacoTheme()
  // Only for a model that does not exist yet. A changing `modified` would
  // make the wrapper write into the model while the person is typing in it.
  const [initialModified] = useState(modified)
  const callbacks = useRef({ onChange, onApi, onChangeCount })
  callbacks.current = { onChange, onApi, onChangeCount }

  const options = useMemo<editor.IDiffEditorConstructionOptions>(
    () => ({
      ...IDE_EDITOR_OPTIONS,
      readOnly,
      domReadOnly: readOnly,
      originalEditable: false,
      renderSideBySide: sideBySide,
      // The review decides when to go inline, so the toggle always means what it says.
      useInlineViewWhenSpaceIsLimited: false,
      // A change in whitespace is still a change someone should see before saving.
      ignoreTrimWhitespace: false,
      renderOverviewRuler: true,
      minimap: { enabled: false },
      folding: false,
      glyphMargin: false,
    }),
    [readOnly, sideBySide],
  )

  function handleMount(diff: editor.IStandaloneDiffEditor, monaco: Monaco) {
    const modifiedEditor = diff.getModifiedEditor()
    hushLanguageMarkers(diff.getOriginalEditor(), monaco)
    let revealed = false
    modifiedEditor.onDidChangeModelContent(() => {
      callbacks.current.onChange(modifiedEditor.getValue())
    })
    diff.onDidUpdateDiff(() => {
      callbacks.current.onChangeCount(diff.getLineChanges()?.length ?? 0)
      if (!revealed) {
        revealed = true
        void diff.revealFirstDiff()
      }
    })
    callbacks.current.onApi({
      goToDiff: (direction) => diff.goToDiff(direction),
      focus: () => modifiedEditor.focus(),
    })
    // The right side is a real editor: Esc from the tab strip, Search seeded
    // from a selection and the palette's commands all drive it.
    const handle = {
      focus: () => modifiedEditor.focus(),
      trigger: (actionId: string) => void modifiedEditor.getAction(actionId)?.run(),
      searchSeed: (ignoreFocus?: boolean) => searchSeedOf(modifiedEditor, ignoreFocus),
    }
    useIdeStore.getState().setEditorHandle(handle)
    // Opened from a button that has since gone (a banner, a dialog, the
    // palette), nothing has the keyboard: the right side takes it. A pane
    // that replaces another (`autoFocus` off) never takes it from the person.
    if (autoFocus && (!document.activeElement || document.activeElement === document.body)) {
      modifiedEditor.focus()
    }
    modifiedEditor.onDidDispose(() => {
      callbacks.current.onApi(null)
      if (useIdeStore.getState().editorHandle === handle) {
        useIdeStore.getState().setEditorHandle(null)
      }
    })
  }

  return (
    <Suspense fallback={<div className="h-full bg-editor" />}>
      <MonacoDiff
        height="100%"
        original={original}
        modified={initialModified}
        language={fileLanguage(path)}
        originalModelPath={originalModelPath(originalKind, workflowId, path)}
        modifiedModelPath={workflowModelPath(workflowId, path)}
        // The workspace owns the right side's model; it outlives this pane.
        keepCurrentModifiedModel
        theme={theme}
        options={options}
        beforeMount={configureMonaco}
        onMount={handleMount}
      />
    </Suspense>
  )
}
