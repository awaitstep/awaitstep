import { waitingOps } from '../../lib/ide/graph-ops'
import { outsideState } from '../../lib/ide/outside-changes'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { EditorBanner } from './editor-banner'
import type { ReviewBindings } from './review-bindings'

type GraphConflictBindings = Pick<ReviewBindings, 'baseline' | 'canEdit' | 'busy' | 'onSaveAll'>

/**
 * A save the server refused because the canvas changed the workflow
 * meanwhile. Nothing was written and nothing is retried by itself: the
 * drafts and pending graph edits are kept, the workspace has refetched, and
 * each draft whose node moved or vanished carries its own banner. A graph
 * edit the new version no longer takes was discarded, and is named here.
 * This one says what happened and what to do next. It goes when nothing it
 * is about is left (saved, discarded), when dismissed, or with the next
 * successful save. A view that cannot edit (its version turned historical
 * under the drafts) has nothing to save again and shows none.
 */
export function GraphConflictBanner({ bindings }: { bindings: GraphConflictBindings }) {
  const conflict = useIdeStore((s) => s.graphConflict)
  const drafts = useIdeStore((s) => s.drafts)
  const conflicts = useIdeStore((s) => s.conflicts)
  const setGraphConflict = useIdeStore((s) => s.setGraphConflict)
  const openFile = useIdeStore((s) => s.openFile)
  const waitingGraphEdits = useIdeStore((s) => waitingOps(s.graphOps).length)

  if (!conflict || !bindings.canEdit) return null
  const dropped = conflict.dropped ?? []
  const droppedLine =
    dropped.length > 0
      ? ` No longer applies, discarded: ${dropped.map((d) => d.label).join(' · ')}.`
      : ''
  // Only graph edits were refused: the ones that still apply wait for Save again.
  if (conflict.paths.length === 0) {
    if (waitingGraphEdits === 0 && dropped.length === 0) return null
    return (
      <EditorBanner
        tone="warn"
        onDismiss={handleDismiss}
        actions={
          waitingGraphEdits > 0 ? (
            <Button
              size="sm"
              onClick={handleSaveAgain}
              disabled={bindings.busy}
              className="h-6 px-2 text-xs"
            >
              Save again
            </Button>
          ) : undefined
        }
      >
        {waitingGraphEdits > 0
          ? `The canvas changed this workflow. Your changes are kept. Save again to apply them on top.${droppedLine}`
          : `The canvas changed this workflow.${droppedLine}`}
      </EditorBanner>
    )
  }
  const refused = conflict.paths.filter((path) => path in drafts)
  if (refused.length === 0 && dropped.length === 0) return null
  // Of those, the ones the refetch has marked: a refused save, or a node
  // whose code changed or that is gone. Those need a look before saving again.
  const marked = refused.filter(
    (path) => path in conflicts || outsideState(bindings.baseline, path, drafts[path]) !== null,
  )

  function handleDismiss() {
    setGraphConflict(null)
  }

  function handleShow() {
    if (marked[0]) openFile(marked[0])
  }

  function handleSaveAgain() {
    bindings.onSaveAll()
  }

  return (
    <EditorBanner
      tone="warn"
      onDismiss={handleDismiss}
      actions={
        marked.length > 0 ? (
          <Button size="sm" onClick={handleShow} className="h-6 px-2 text-xs">
            Show
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSaveAgain}
            disabled={bindings.busy}
            className="h-6 px-2 text-xs"
          >
            Save again
          </Button>
        )
      }
    >
      {marked.length > 0
        ? `The canvas changed this workflow while you were editing. Your edits are kept. Review the marked files, then save again.${droppedLine}`
        : `The canvas changed this workflow. Save again to apply your edits on top.${droppedLine}`}
    </EditorBanner>
  )
}
