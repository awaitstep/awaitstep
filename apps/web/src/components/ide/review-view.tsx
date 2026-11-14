import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { dirtyPaths, type Draft } from '../../lib/ide/drafts'
import { useElementWidth } from '../../hooks/use-element-width'
import {
  currentReviewPath,
  effectiveSideBySide,
  reviewOrder,
  reviewPathAfterLeaving,
  reviewSummary,
  stepReviewPath,
} from '../../lib/ide/review'
import { fileOpLabel, newFilePaths, opAtPath, type PendingFileOp } from '../../lib/ide/file-ops'
import { pendingStepPaths, waitingOps } from '../../lib/ide/graph-ops'
import { outsideState } from '../../lib/ide/outside-changes'
import { REVIEW_TAB_ID } from '../../lib/ide/tabs'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { DiffPane, type DiffPaneApi } from './diff-pane'
import { DiffToolbar, HeaderButton, SideCaptions, ViewToggle } from './diff-parts'
import { PendingChanges } from './pending-changes'
import type { ReviewBindings } from './review-bindings'

/**
 * The Unsaved changes tab: the pending graph edits first (the Graph entry),
 * then saved on the left, your unsaved text on the right, one file at a
 * time, with the actions that settle each file. The right side is the
 * file's own editor model, so editing here is editing the file. A step a
 * pending edit adds is a new file: nothing saved stands on its left.
 */
export function ReviewView({ bindings }: { bindings: ReviewBindings }) {
  const { fileOps } = bindings
  const { drafts, graphOps, reviewPath, inline, setReviewPath, setReviewInline, closeFile } =
    useIdeStore(
      useShallow((s) => ({
        drafts: s.drafts,
        graphOps: s.graphOps,
        reviewPath: s.reviewPath,
        inline: s.reviewInline,
        setReviewPath: s.setReviewPath,
        setReviewInline: s.setReviewInline,
        closeFile: s.closeFile,
      })),
    )
  const graphEntries = useMemo(
    () =>
      waitingOps(graphOps).map((entry) => ({
        id: entry.id,
        label: entry.label,
        ...(entry.saving && { locked: true }),
      })),
    [graphOps],
  )
  const fileEntries = useMemo(
    () => fileOps.map((op) => ({ id: op.id, label: fileOpLabel(op) })),
    [fileOps],
  )
  // Files with nothing saved at their path: a pending step's, a new or renamed file.
  const newPaths = useMemo(
    () =>
      new Set(
        [...pendingStepPaths(graphOps), ...newFilePaths(fileOps)].filter((path) =>
          bindings.baseline.has(path),
        ),
      ),
    [graphOps, fileOps, bindings.baseline],
  )
  const order = useMemo(
    () => reviewOrder(new Set([...dirtyPaths(bindings.baseline, drafts), ...newPaths])),
    [bindings.baseline, drafts, newPaths],
  )
  const current = currentReviewPath(order, reviewPath, (path) => bindings.files.has(path))

  function handleClose() {
    closeFile(REVIEW_TAB_ID)
  }

  if (current === null && graphEntries.length === 0 && fileEntries.length === 0) {
    return <NothingToReview onClose={handleClose} />
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PendingChanges
        title="Graph"
        label="Graph changes"
        entries={graphEntries}
        canEdit={bindings.canEdit}
        busy={bindings.busy}
        onDiscard={bindings.onDiscardGraphOp}
      />
      <PendingChanges
        title="Files"
        label="File changes"
        entries={fileEntries}
        canEdit={bindings.canEdit}
        busy={bindings.busy}
        onDiscard={bindings.onDiscardFileOp}
      />
      <div className="min-h-0 flex-1">
        {current !== null && (
          <ReviewFile
            path={current}
            draft={drafts[current]}
            isNew={newPaths.has(current)}
            renamedFrom={renamedFrom(fileOps, current)}
            order={order}
            bindings={bindings}
            inline={inline}
            onSelectPath={setReviewPath}
            onInline={setReviewInline}
          />
        )}
      </div>
    </div>
  )
}

function NothingToReview({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-background p-6">
      <p className="text-sm text-foreground">No unsaved changes</p>
      {/* The view just emptied under the buttons that were pressed: keep focus here. */}
      <Button size="sm" variant="outline" onClick={onClose} autoFocus>
        Close
      </Button>
    </div>
  )
}

interface ReviewFileProps {
  path: string
  draft: Draft | undefined
  /** Nothing is saved at this path yet: a pending step's file, a new or renamed file. */
  isNew: boolean
  /** A pending rename's old path: the left side is that file as saved. */
  renamedFrom: string | null
  order: string[]
  bindings: ReviewBindings
  inline: boolean
  onSelectPath: (path: string | null) => void
  onInline: (inline: boolean) => void
}

function ReviewFile({
  path,
  draft,
  isNew,
  renamedFrom,
  order,
  bindings,
  inline,
  onSelectPath,
  onInline,
}: ReviewFileProps) {
  const { baseline, files, canEdit, busy } = bindings
  // The pane mounted with the view keeps the keyboard it was given; a pane
  // that replaces another (another file) never takes it from where it is.
  const [firstPath] = useState(path)
  const [widthRef, width] = useElementWidth()
  const [api, setApi] = useState<DiffPaneApi | null>(null)
  // Counted per file: the toolbar outlives a switch of file (so focus stays
  // on the button just pressed), only the diff beneath it is replaced.
  const [counted, setCounted] = useState<{ path: string; count: number } | null>(null)
  const changes = counted?.path === path ? counted.count : null
  const sideBySide = effectiveSideBySide(inline, width)
  const index = order.indexOf(path)
  const readOnly = !canEdit || bindings.editabilityOf(path).readOnly
  const canStep = index === -1 ? order.length > 0 : order.length > 1
  const clean = draft === undefined
  const movedOnServer = !isNew && outsideState(baseline, path, draft) !== null
  const modified = files.get(path)?.source ?? ''

  function handleChangeCount(count: number) {
    setCounted({ path, count })
  }

  function handlePrevFile() {
    onSelectPath(stepReviewPath(order, path, -1))
  }

  function handleNextFile() {
    onSelectPath(stepReviewPath(order, path, 1))
  }

  function handlePrevChange() {
    api?.goToDiff('previous')
  }

  function handleNextChange() {
    api?.goToDiff('next')
  }

  // Typing can make this file match its saved text; pinning it keeps the
  // view here ("no changes") instead of moving on to the next file mid-edit.
  function handleChange(text: string) {
    bindings.onChange(path, text)
    if (useIdeStore.getState().reviewPath !== path) onSelectPath(path)
  }

  function handleRevert() {
    onSelectPath(reviewPathAfterLeaving(order, path))
    bindings.onRevert(path)
  }

  // Land on the file that follows, unless the person has moved on meanwhile.
  async function handleSave() {
    const next = reviewPathAfterLeaving(order, path)
    const saved = await bindings.onSave(path)
    const selected = useIdeStore.getState().reviewPath
    if (saved && (selected === null || selected === path)) onSelectPath(next)
  }

  function handleSaveClick() {
    void handleSave()
  }

  function handleCompare() {
    bindings.onCompare(path)
  }

  return (
    <div ref={widthRef} className="flex h-full min-h-0 flex-col bg-background">
      <DiffToolbar label="Review actions">
        <span className="min-w-0 truncate font-mono text-foreground" title={path}>
          {path}
        </span>
        <span className="text-muted-foreground">{reviewSummary(index, order.length, changes)}</span>
        <HeaderButton
          aria-label="Previous file"
          title="Previous unsaved file"
          disabled={!canStep}
          onClick={handlePrevFile}
        >
          <ChevronLeft aria-hidden="true" />
          File
        </HeaderButton>
        <HeaderButton
          aria-label="Next file"
          title="Next unsaved file"
          disabled={!canStep}
          onClick={handleNextFile}
        >
          File
          <ChevronRight aria-hidden="true" />
        </HeaderButton>
        <HeaderButton
          aria-label="Previous change"
          title="Previous change (⇧F7 in the editor)"
          disabled={!api || changes === 0}
          onClick={handlePrevChange}
        >
          <ChevronUp aria-hidden="true" />
          Change
        </HeaderButton>
        <HeaderButton
          aria-label="Next change"
          title="Next change (F7 in the editor)"
          disabled={!api || changes === 0}
          onClick={handleNextChange}
        >
          <ChevronDown aria-hidden="true" />
          Change
        </HeaderButton>
        <span className="flex-1" />
        <ViewToggle
          sideBySide={sideBySide}
          tooNarrow={width !== null && !effectiveSideBySide(false, width)}
          onChange={onInline}
        />
        {movedOnServer && <HeaderButton onClick={handleCompare}>Compare with server</HeaderButton>}
        <HeaderButton onClick={handleRevert} disabled={!canEdit || busy || clean}>
          Revert file
        </HeaderButton>
        <HeaderButton onClick={handleSaveClick} disabled={!canEdit || busy || (clean && !isNew)}>
          Save file
        </HeaderButton>
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={bindings.onSaveAll}
          disabled={!canEdit || busy}
        >
          Save all
        </Button>
      </DiffToolbar>
      <SideCaptions
        sideBySide={sideBySide}
        left={
          renamedFrom !== null
            ? `Saved as ${renamedFrom} · read-only`
            : isNew
              ? 'New file · nothing saved'
              : baseline.has(path)
                ? 'Saved · read-only'
                : 'Deleted on the server · nothing saved'
        }
        right={readOnly ? 'Unsaved · read-only' : 'Unsaved · editable'}
      />
      <div className="min-h-0 flex-1">
        <DiffPane
          key={path}
          workflowId={bindings.workflowId}
          path={path}
          original={isNew && renamedFrom === null ? '' : (baseline.get(path)?.source ?? '')}
          originalKind="saved"
          modified={modified}
          readOnly={readOnly}
          autoFocus={path === firstPath}
          sideBySide={sideBySide}
          onChange={handleChange}
          onApi={setApi}
          onChangeCount={handleChangeCount}
        />
      </div>
    </div>
  )
}

/** The old path of a pending rename to `path`, else null. */
function renamedFrom(ops: readonly PendingFileOp[], path: string): string | null {
  const op = opAtPath(ops, path)
  return op?.kind === 'move' ? op.from : null
}
