import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useApi, useApiReady, useQueries } from '../../contexts/api-client-context'
import { useEditorAccess } from '../../contexts/editor-scope-context'
import { failureLine } from '../../lib/action-toast'
import { splitSecretName } from '../../lib/env-var-parser'
import {
  declaredEnvRows,
  envVarsError,
  groupOf,
  linkedGlobal,
  maskedRenameError,
  missingValueError,
  parseEnvVars,
  rowsFromDotenv,
  summarize,
  toApiEnvVars,
  type DraftEnvRow,
  type EnvGroup,
  type EnvRow,
} from '../../lib/workflows/env-vars'
import { useWorkflowStore } from '../../stores/workflow-store'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { EmptyEnvVars, EnvGroupHeading, EnvRowFields } from './env-vars-rows'
import { focusMoreActions } from './top-bar-focus'

interface EnvVarsDialogProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The workflow's environment variables, for the canvas and the code workspace
 * alike. They belong to the workflow, not to a version, so this saves them on
 * its own: no canvas Save, no Save all.
 */
export function EnvVarsDialog({ workflowId, open, onOpenChange }: EnvVarsDialogProps) {
  const [edited, setEdited] = useState(false)

  // Focus goes back to the ⋯ button the dialog was opened from.
  function handleCloseAutoFocus(event: Event) {
    event.preventDefault()
    focusMoreActions()
  }

  // A stray click outside must not throw away what was typed (a secret, say);
  // Esc and Cancel are deliberate.
  function handleInteractOutside(event: Event) {
    if (edited) event.preventDefault()
  }

  function handleOpenChange(next: boolean) {
    if (!next) setEdited(false)
    onOpenChange(next)
  }

  function handleDone() {
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="xl"
        onCloseAutoFocus={handleCloseAutoFocus}
        onInteractOutside={handleInteractOutside}
      >
        <DialogHeader>
          <DialogTitle>Environment variables</DialogTitle>
          <DialogDescription>
            Names starting with SECRET_ are encrypted. Link a variable to reuse a global value.
          </DialogDescription>
        </DialogHeader>
        <EnvVarsForm workflowId={workflowId} onDone={handleDone} onEditedChange={setEdited} />
      </DialogContent>
    </Dialog>
  )
}

interface EnvVarsFormProps {
  workflowId: string
  onDone: () => void
  onEditedChange: (edited: boolean) => void
}

const GROUP_ORDER: EnvGroup[] = ['attention', 'secrets', 'variables']

function EnvVarsForm({ workflowId, onDone, onEditedChange }: EnvVarsFormProps) {
  const api = useApi()
  const queries = useQueries()
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const access = useEditorAccess()
  const enabled = ready && workflowId !== 'new'
  // The workflow's own row (secrets masked), not the editor's workflow-full
  // query: refetching that one makes the canvas rebuild itself from the saved
  // version and drop the drawing and undo history in front of it.
  const detail = useQuery({ ...queries.workflows.detail(workflowId), enabled })
  // Read only for the names a version declares; this never causes a fetch of its own.
  const full = useQuery({
    ...queries.workflows.full(workflowId),
    enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const saved = parseEnvVars(detail.data?.envVars)
  // Nothing stored but names declared (an import): start from those, as the
  // old panel did, so saving does not drop them from the next version.
  const base = saved.length > 0 ? saved : declaredEnvRows(full.data?.version?.ir)

  // The draft starts from what is stored, then is the person's.
  const [draft, setDraft] = useState<DraftEnvRow[] | null>(null)
  const rows =
    draft ??
    base.map((row) => ({ ...row, from: saved.length > 0 ? row.name : null, group: groupOf(row) }))
  const [notice, setNotice] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refusal = envVarsError(rows) ?? maskedRenameError(rows) ?? missingValueError(rows)
  const changed = JSON.stringify(toApiEnvVars(rows)) !== JSON.stringify(toApiEnvVars(saved))
  const counts = summarize(rows)
  // The list below is padded (and pulled back with a negative margin) so focus
  // rings have room: a scrolling area clips whatever is drawn outside its box.
  // The list's padding (and the matching negative margin) leaves room for focus
  // rings, which a scrolling area would otherwise clip.

  const save = useMutation({
    // A failure is also said in the dialog, which stays open for another try.
    meta: {
      toast: { success: 'Environment variables saved', error: 'Couldn’t save the variables' },
    },
    mutationFn: () =>
      api.updateWorkflow(workflowId, {
        envVars: toApiEnvVars(rows),
        // What was read: if someone else saved variables meanwhile, this is refused, not overwritten.
        envVarsBase: detail.data?.envVars ?? '',
      }),
    onSuccess: async () => {
      // What the canvas validates and writes into the next version, kept in
      // step without a dirty mark or an undo step of its own.
      const history = useWorkflowStore.temporal.getState()
      history.pause()
      useWorkflowStore.setState({ workflowEnvVars: toEditorRows(rows) })
      history.resume()
      // Marked stale, not refetched now: a refetch rebuilds the canvas from
      // the saved version. The next time the editor loads it, it is fresh.
      void queryClient.invalidateQueries({
        queryKey: ['workflow-full', workflowId],
        refetchType: 'none',
      })
      await queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      onDone()
    },
    onError: (err) => setServerError(failureLine(err, 'Couldn’t save the variables')),
  })

  function edit(next: DraftEnvRow[]) {
    setServerError(null)
    setNotice(null)
    setDraft(next)
    onEditedChange(JSON.stringify(toApiEnvVars(next)) !== JSON.stringify(toApiEnvVars(saved)))
  }

  function handleAdd() {
    edit([...rows, { name: '', value: '', from: null, group: 'variables' }])
  }

  function handleImportClick() {
    fileInput.current?.click()
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const {
      rows: added,
      invalid,
      present,
    } = rowsFromDotenv(
      await file.text(),
      rows.map((row) => row.name),
    )
    edit([...rows, ...added.map((row) => ({ ...row, from: null, group: groupOf(row) }))])
    const skipped = [
      invalid > 0 && `${invalid} line${invalid === 1 ? '' : 's'} it couldn’t read`,
      present > 0 && `${present} already defined`,
    ].filter(Boolean)
    setNotice(
      `Added ${added.length} variable${added.length === 1 ? '' : 's'}${skipped.length ? `; left out ${skipped.join(' and ')}` : ''}.`,
    )
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!access.canEdit || !changed || refusal || save.isPending) return
    save.mutate()
  }

  if (detail.isPending) return <p className="py-6 text-xs text-muted-foreground">Loading…</p>
  if (detail.isError) {
    return <p className="py-6 text-xs text-status-error">Couldn’t load the variables.</p>
  }

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-1">
      {!access.canEdit && (
        <p className="mb-2 text-xs text-muted-foreground">
          {access.reason ?? 'You can’t edit these.'}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyEnvVars canEdit={access.canEdit} onAdd={handleAdd} onImport={handleImportClick} />
      ) : (
        <div className="-mx-1 max-h-[52vh] overflow-y-auto px-1 py-1">
          <div className="grid grid-cols-[minmax(0,184px)_minmax(0,1fr)_28px_28px] gap-2 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Name</span>
            <span>Value</span>
          </div>
          {GROUP_ORDER.map((group) => {
            const inGroup = rows.flatMap((row, index) =>
              row.group === group ? [{ row, index }] : [],
            )
            if (inGroup.length === 0) return null
            return (
              <section key={group} aria-label={group}>
                <EnvGroupHeading group={group} count={inGroup.length} />
                <div className="space-y-2">
                  {inGroup.map(({ row, index }) => (
                    <EnvRowFields
                      key={index}
                      row={row}
                      disabled={!access.canEdit}
                      onChange={(patch) =>
                        edit(rows.map((r, j) => (j === index ? { ...r, ...patch } : r)))
                      }
                      onToggleLink={() =>
                        edit(rows.map((r, j) => (j === index ? toggledLink(r) : r)))
                      }
                      onRemove={() => edit(rows.filter((_, j) => j !== index))}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {access.canEdit && rows.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add variable
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleImportClick}>
            Import from .env
          </Button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".env,text/plain"
        aria-label="Import a .env file"
        className="hidden"
        onChange={handleFile}
      />
      <p role="status" className="mt-2 min-h-4 text-2xs text-status-error">
        {serverError ?? refusal ?? ''}
      </p>
      {notice && <p className="text-2xs text-muted-foreground">{notice}</p>}
      <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">{footerSummary(counts)}</span>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {access.canEdit ? 'Cancel' : 'Close'}
        </Button>
        {access.canEdit && (
          <Button type="submit" size="sm" disabled={!changed || !!refusal || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </div>
    </form>
  )
}

/** "1 encrypted · 1 linked · 1 needs a value", or how many there are when none is special. */
function footerSummary(counts: ReturnType<typeof summarize>): string {
  const parts = [
    counts.secrets > 0 && `${counts.secrets} encrypted`,
    counts.linked > 0 && `${counts.linked} linked`,
    counts.missing > 0 && `${counts.missing} ${counts.missing === 1 ? 'needs' : 'need'} a value`,
  ].filter(Boolean)
  const total = `${counts.total} ${counts.total === 1 ? 'variable' : 'variables'}`
  return parts.length > 0 ? parts.join(' · ') : total
}

/** The link button: point at the global of this name, or take the pointer away. */
function toggledLink(row: DraftEnvRow): DraftEnvRow {
  if (linkedGlobal(row.value) !== null) return { ...row, value: '' }
  const { name } = splitSecretName(row.name.trim())
  return name ? { ...row, value: `{{global.env.${name}}}` } : row
}

/** The rows the canvas store keeps: no blank lines, no draft bookkeeping. */
function toEditorRows(rows: readonly DraftEnvRow[]): EnvRow[] {
  return rows
    .filter((row) => row.name.trim() !== '')
    .map(({ name, value }) => ({ name: name.trim(), value }))
}
