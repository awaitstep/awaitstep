import { useShallow } from 'zustand/react/shallow'
import { actionToast } from '../../lib/action-toast'
import { focusEditorSoon } from '../../lib/ide/editor-focus'
import { basename } from '../../lib/ide/file-tree'
import { outsideState } from '../../lib/ide/outside-changes'
import { copyToClipboard } from '../../lib/utils'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { EditorBanner } from './editor-banner'
import type { ReviewBindings } from './review-bindings'

type FileStateBindings = Pick<
  ReviewBindings,
  | 'baseline'
  | 'busy'
  | 'ownerOf'
  | 'onCompare'
  | 'onUseServerVersion'
  | 'onRecreate'
  | 'onDiscardDeleted'
>

/**
 * What happened to the open file on the server while it was being edited:
 * deleted, refused on save, or changed. One banner at a time, most serious
 * first. It shows only for a file with unsaved text; a clean file just
 * updates in place. For a step's source the other side is the canvas: its
 * node was removed, or its code changed there.
 */
export function FileStateBanner({ path, bindings }: { path: string; bindings: FileStateBindings }) {
  const { baseline, busy } = bindings
  const { draft, conflict, dismissed } = useIdeStore(
    useShallow((s) => ({
      draft: s.drafts[path],
      conflict: s.conflicts[path],
      dismissed: s.dismissedOutside[path],
    })),
  )
  const dismissOutside = useIdeStore((s) => s.dismissOutside)
  const state = outsideState(baseline, path, draft)
  const name = basename(path)
  const serverHash = baseline.get(path)?.hash ?? null
  const isStep = bindings.ownerOf(path) === 'step'
  const where = isStep ? 'on the canvas' : 'on the server'
  const theirs = isStep ? 'Use canvas version' : 'Use server version'

  function handleCompare() {
    bindings.onCompare(path)
  }

  // Each of these removes the banner that holds the button pressed, which
  // would drop focus to the page: the editor takes it instead.
  function handleUseServer() {
    bindings.onUseServerVersion(path, serverHash)
    focusEditorSoon()
  }

  function handleKeep() {
    dismissOutside(path, serverHash)
    focusEditorSoon()
  }

  function handleRecreate() {
    void bindings.onRecreate(path)
    focusEditorSoon()
  }

  function handleDiscard() {
    bindings.onDiscardDeleted(path)
    focusEditorSoon()
  }

  // The banner stays, so focus does too.
  function handleCopyCode() {
    if (!draft) return
    copyToClipboard(draft.source)
      .then(() => actionToast.success('Code copied'))
      .catch(() => actionToast.error('Couldn’t copy the code'))
  }

  if (!draft) return null

  if (state === 'deleted' && isStep) {
    return (
      <EditorBanner
        tone="warn"
        actions={
          <>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleCopyCode}>
              Copy code
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={handleDiscard}
            >
              Discard
            </Button>
          </>
        }
      >
        The step behind <b className="font-medium">{name}</b> was removed from the canvas. Your
        unsaved code is kept here.
      </EditorBanner>
    )
  }

  if (state === 'deleted') {
    return (
      <EditorBanner
        tone="warn"
        actions={
          <>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleRecreate} disabled={busy}>
              Save to recreate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={handleDiscard}
            >
              Discard
            </Button>
          </>
        }
      >
        <b className="font-medium">{name}</b> was deleted on the server. Your unsaved copy is kept.
      </EditorBanner>
    )
  }

  if (conflict) {
    return (
      <EditorBanner
        tone="error"
        actions={
          <Button size="sm" className="h-6 px-2 text-xs" onClick={handleCompare}>
            Compare
          </Button>
        }
      >
        Couldn’t save <b className="font-medium">{name}</b>. It changed {where}.
      </EditorBanner>
    )
  }

  if (state === 'changed' && dismissed !== serverHash) {
    return (
      <EditorBanner
        tone="warn"
        actions={
          <>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleCompare}>
              Compare
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleKeep}>
              Keep my edits
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={handleUseServer}
              disabled={busy}
            >
              {theirs}
            </Button>
          </>
        }
      >
        <b className="font-medium">{name}</b> changed {where} while you were editing it.
      </EditorBanner>
    )
  }

  return null
}
