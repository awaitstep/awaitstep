import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useElementWidth } from '../../hooks/use-element-width'
import { ApiError } from '../../lib/api-client'
import { focusEditorSoon } from '../../lib/ide/editor-focus'
import { effectiveSideBySide } from '../../lib/ide/review'
import { formatClock } from '../../lib/ide/session-log'
import { compareTabId } from '../../lib/ide/tabs'
import { basename } from '../../lib/ide/file-tree'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { DiffPane } from './diff-pane'
import { DiffToolbar, HeaderButton, SideCaptions, ViewToggle } from './diff-parts'
import type { ReviewBindings } from './review-bindings'
import { useApi } from '../../contexts/api-client-context'

/**
 * Compare: the server's copy of a file (left, read-only) beside yours
 * (right, editable). It reads the server copy itself, so the text and the
 * hash Overwrite is conditional on come from the same response.
 */
export function CompareView({ path, bindings }: { path: string; bindings: ReviewBindings }) {
  const api = useApi()
  const { workflowId, baseline } = bindings
  const { draft, conflict, inline, closeFile, setReviewInline } = useIdeStore(
    useShallow((s) => ({
      draft: s.drafts[path],
      conflict: s.conflicts[path],
      inline: s.reviewInline,
      closeFile: s.closeFile,
      setReviewInline: s.setReviewInline,
    })),
  )
  // What the editor already knew of the server's hash when the copy was
  // fetched, so a hash it learns of later is recognisably newer.
  const knownNow = useRef<string[]>([])
  knownNow.current = [baseline.get(path)?.hash, conflict?.currentHash].filter(isHash)
  // The fetched copy is kept for the life of the Compare tab (useCompareCache
  // drops it when the tab closes, the workspace unmounts or another tab signs
  // out; opening Compare afresh drops it too), so switching tabs and back does
  // not quietly swap the left side for a newer server copy.
  const server = useQuery({
    queryKey: ['ide-compare', workflowId, path],
    queryFn: async () => {
      const known = knownNow.current
      const file = await api.getProjectFile(workflowId, path)
      return { ...file, known: [...known, file.hash] }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const [widthRef, width] = useElementWidth()
  const [changes, setChanges] = useState<number | null>(null)
  const [overwriting, setOverwriting] = useState(false)
  const sideBySide = effectiveSideBySide(inline, width)

  const deleted = server.error instanceof ApiError && server.error.status === 404
  const loaded = server.data
  const readOnly = !bindings.canEdit || bindings.editabilityOf(path).readOnly
  // A server hash the editor learned of after this copy was fetched (its own
  // check, or a save the server refused): the copy on the left is out of date.
  // Reload fetches again and so clears it.
  const outdated =
    loaded !== undefined &&
    [baseline.get(path)?.hash, conflict?.currentHash].some(
      (hash) => isHash(hash) && !loaded.known.includes(hash),
    )

  function handleClose() {
    closeFile(compareTabId(path))
  }

  function handleReload() {
    void server.refetch()
  }

  function handleUseServer() {
    bindings.onUseServerVersion(path, loaded?.hash ?? null)
    handleClose()
    focusEditorSoon()
  }

  async function handleOverwrite() {
    if (!loaded) return
    setOverwriting(true)
    try {
      // The write moved the server on to the person's own text: read it back,
      // so the next overwrite is conditional on that hash and the left side
      // is what is stored, instead of claiming the file changed.
      if (await bindings.onOverwrite(path, loaded.hash)) await server.refetch()
    } finally {
      setOverwriting(false)
    }
  }

  function handleOverwriteClick() {
    void handleOverwrite()
  }

  async function handleRecreate() {
    // The file exists again: read it, and the view becomes a normal comparison.
    if (await bindings.onRecreate(path)) await server.refetch()
  }

  function handleRecreateClick() {
    void handleRecreate()
  }

  // Letting go of the copy leaves nothing to compare, so the tab closes too.
  function handleDiscard() {
    bindings.onDiscardDeleted(path)
    handleClose()
    focusEditorSoon()
  }

  function handleChange(text: string) {
    bindings.onChange(path, text)
  }

  if (server.isPending) {
    return <CompareMessage>Loading the server copy of {basename(path)}…</CompareMessage>
  }
  if (deleted) {
    return (
      <CompareMessage>
        <p>
          {basename(path)} was deleted on the server.
          {draft ? ' Your unsaved copy is kept.' : ''}
        </p>
        <div className="flex gap-2">
          {draft && (
            <>
              <Button
                size="sm"
                onClick={handleRecreateClick}
                disabled={!bindings.canEdit || bindings.busy}
              >
                Save to recreate
              </Button>
              <Button size="sm" variant="outline" onClick={handleDiscard}>
                Discard
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </CompareMessage>
    )
  }
  if (!loaded) {
    return (
      <CompareMessage>
        <p>Couldn’t load the server copy of {basename(path)}.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleReload}>
            Try again
          </Button>
          <Button size="sm" variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </CompareMessage>
    )
  }

  const loadedAt = formatClock(new Date(server.dataUpdatedAt).toISOString())
  const busy = bindings.busy || overwriting

  return (
    <div ref={widthRef} className="flex h-full min-h-0 flex-col bg-background">
      <DiffToolbar label="Compare actions">
        <span className="min-w-0 truncate font-mono text-foreground" title={path}>
          {path}
        </span>
        <span className="text-muted-foreground">
          {changes === null ? '' : changes === 1 ? '1 change' : `${changes} changes`}
        </span>
        <span className="flex-1" />
        <ViewToggle
          sideBySide={sideBySide}
          tooNarrow={width !== null && !effectiveSideBySide(false, width)}
          onChange={setReviewInline}
        />
        <HeaderButton onClick={handleClose}>Close</HeaderButton>
        <HeaderButton onClick={handleUseServer} disabled={!draft || !bindings.canEdit || busy}>
          Use server version
        </HeaderButton>
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleOverwriteClick}
          disabled={!draft || readOnly || busy}
        >
          Keep mine and overwrite
        </Button>
      </DiffToolbar>
      {outdated && (
        <div className="flex shrink-0 items-center gap-3 border-b border-status-warning/30 bg-tone-warn px-3 py-1.5 text-xs text-foreground/80">
          <span className="flex-1">The server copy changed again after this was loaded.</span>
          <HeaderButton onClick={handleReload}>Reload</HeaderButton>
        </div>
      )}
      <SideCaptions
        sideBySide={sideBySide}
        left={`On the server · loaded ${loadedAt} · read-only`}
        right={readOnly ? 'Your copy · read-only' : 'Your copy · editable'}
      />
      <div className="min-h-0 flex-1">
        <DiffPane
          key={loaded.hash}
          workflowId={workflowId}
          path={path}
          original={loaded.source}
          originalKind="server"
          modified={bindings.files.get(path)?.source ?? ''}
          readOnly={readOnly}
          sideBySide={sideBySide}
          onChange={handleChange}
          onApi={noop}
          onChangeCount={setChanges}
        />
      </div>
      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        To keep parts of both, edit your copy on the right, then overwrite. There is no automatic
        merge.
      </p>
    </div>
  )
}

function noop() {}

function isHash(hash: string | undefined | null): hash is string {
  return typeof hash === 'string' && hash !== ''
}

function CompareMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-sm text-foreground">
      {children}
    </div>
  )
}
