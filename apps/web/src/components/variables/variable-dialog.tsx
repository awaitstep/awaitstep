import { useId, useState, type SubmitEvent } from 'react'
import { Braces, Trash2 } from 'lucide-react'
import { isEnvVarName } from '@awaitstep/ir'
import { errorFieldOf } from '../../data/dashboard/errors'
import { ApiError } from '../../lib/api-client'
import { useDeleteVariable, useSetVariable } from '../../data/dashboard/variables'
import type {
  VariableLevel,
  VariableReach,
  VariableReachInput,
  VariableScope,
} from '../../types/dashboard/variables'
import { Button } from '../ui/button'
import { CheckboxCard } from '../ui/choice-card'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { Banner } from '../ui/banner'
import { ReachPicker, type PlaceChoices } from './parts/reach-picker'

/** The level a variable is set at: where the dialog saves it. */
export interface VariableTarget {
  /** `org`, `project`, or `ws:<slug>`. */
  id: string
  kind: VariableLevel
  scope: VariableScope
  /** Its name, for "Already set in …" and titles. */
  name: string
}

/** What the dialog does: add, change one value, or override an inherited one. */
export type VariableDialogMode =
  | { kind: 'new' }
  | {
      kind: 'edit'
      id: string
      name: string
      value: string | null
      isSecret: boolean
      /** Where it applies now, when it is a project's or org's. */
      reach?: VariableReach | null
    }
  | { kind: 'override'; name: string; isSecret: boolean }

/**
 * What a save sends for "Applies to": nothing for a new variable left at every
 * place, "everywhere" when an edit widens to it, or the places newly ticked.
 */
function reachChoice(
  widenable: boolean,
  all: boolean,
  added: string[],
  mode: VariableDialogMode['kind'],
  now: VariableReach | null,
): VariableReachInput | undefined {
  if (!widenable) return undefined
  if (all) return mode === 'edit' && now && !now.all ? { all: true } : undefined
  return added.length > 0 ? { ids: added } : undefined
}

const NAME_RULE = 'Use capital letters, numbers and underscores, starting with a letter'

interface VariableDialogProps {
  org: string
  mode: VariableDialogMode
  /** The page's own level, where the variable is saved. Null until it is known: nothing saves. */
  target: VariableTarget | null
  /** The workspaces (at a project) or projects (at the org) it can be limited to; none at a workspace. */
  places?: PlaceChoices
  onClose: () => void
}

/**
 * `NewVariable`: name, value, secret, and where it applies. Also Edit
 * (`?variable=NAME`, set here) and Override (`?variable=NAME`, inherited), with the name
 * fixed (D-P6-4..6).
 */
export function VariableDialog({ org, mode, target, places, onClose }: VariableDialogProps) {
  const formId = useId()
  const save = useSetVariable(org)
  const remove = useDeleteVariable(org)
  const fixedName = mode.kind === 'new' ? null : mode.name
  const [name, setName] = useState(fixedName ?? '')
  const [value, setValue] = useState(
    mode.kind === 'edit' && !mode.isSecret ? (mode.value ?? '') : '',
  )
  const [isSecret, setIsSecret] = useState(mode.kind === 'new' ? false : mode.isSecret)
  // Where it applies: an edit starts from what the variable reaches now.
  const reachNow = mode.kind === 'edit' ? (mode.reach ?? null) : null
  const [reachAll, setReachAll] = useState(reachNow?.all ?? true)
  const [picked, setPicked] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  // The name as the API and a reference accept it: checked here before a
  // request, so a typo never waits on a round trip.
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined)

  // Only a project's or org's variable has a reach, and one that already applies
  // everywhere has nothing left to widen.
  const lockedIds = reachNow && !reachNow.all ? reachNow.places.map((p) => p.id) : []
  const blockedIds = reachNow?.blocked ?? []
  const widenable = places !== undefined && mode.kind !== 'override' && reachNow?.all !== true
  const addedIds = picked.filter((id) => !lockedIds.includes(id))
  const reachInput = reachChoice(widenable, reachAll, addedIds, mode.kind, reachNow)

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleName(next: string) {
    // A deployed worker reads `env.NAME`: the name is capitals, as typed on the canvas.
    setName(next.toUpperCase())
    setNameIssue(undefined)
    save.reset()
  }

  function handleValue(next: string) {
    setValue(next)
    save.reset()
  }

  function handleReachAll(next: boolean) {
    setReachAll(next)
    save.reset()
  }

  function handlePicked(next: string[]) {
    setPicked(next)
    save.reset()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (!target) return
    if (!isEnvVarName(name)) {
      setNameIssue(NAME_RULE)
      return
    }
    save.mutate(
      {
        scope: target.scope,
        name,
        value,
        isSecret,
        mode: mode.kind === 'edit' ? 'edit' : 'create',
        ...(reachInput && { reach: reachInput }),
        ...(mode.kind === 'edit' && { id: mode.id, wasSecret: mode.isSecret }),
      },
      { onSuccess: onClose },
    )
  }

  function handleAskDelete() {
    remove.reset()
    setDeleting(true)
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDeleting(false)
  }

  function handleDelete() {
    if (!target || !fixedName) return
    remove.mutate(
      {
        scope: target.scope,
        name: fixedName,
        ...(mode.kind === 'edit' && { id: mode.id }),
      },
      { onSuccess: onClose },
    )
  }

  const field = errorFieldOf(save.error)
  const nameError =
    nameIssue ??
    (field === 'name'
      ? // The API's 409 says "here"; the dialog knows where "here" is.
        save.error instanceof ApiError && save.error.status === 409
        ? `Already set in ${target?.name ?? 'this level'}. Edit it instead`
        : save.error?.message
      : undefined)
  const valueError = field === 'value' ? save.error?.message : undefined
  // Errors that belong to no field (no access, gone meanwhile) go above the form.
  const formError = save.error && !field ? save.error.message : undefined
  const title =
    mode.kind === 'new'
      ? 'New variable'
      : mode.kind === 'edit'
        ? `Edit ${mode.name}`
        : `Override ${mode.name} in ${target?.name ?? ''}`
  const description =
    mode.kind === 'override'
      ? 'This value replaces the inherited one here.'
      : 'A value your workflows read at run time.'
  const keepsSecret = mode.kind === 'edit' && mode.isSecret
  const valueHint = keepsSecret ? 'Leave empty to keep the current value.' : undefined
  const submitLabel =
    mode.kind === 'new' ? 'Add variable' : mode.kind === 'edit' ? 'Save' : 'Override'
  const needsPlaces = widenable && !reachAll && mode.kind !== 'edit' && addedIds.length === 0
  const canSubmit = !save.isPending && target !== null && !needsPlaces
  const valueType = isSecret ? 'password' : 'text'
  const deleteBody =
    remove.error?.message ??
    `Workflows reading global.env.${fixedName} get the inherited value, or nothing, from their next run.`
  const deleteButton = mode.kind === 'edit' && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-status-error"
      onClick={handleAskDelete}
    >
      <Trash2 aria-hidden="true" />
      Delete variable
    </Button>
  )
  return (
    <>
      <ModalDialog
        open
        onOpenChange={handleOpenChange}
        size="md"
        leading={
          <Tile tone="warn" size="lg">
            <Braces />
          </Tile>
        }
        title={title}
        description={description}
        footerStart={deleteButton}
        actions={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-5">
          {formError && <Banner tone="warn">{formError}</Banner>}
          <FormField
            label="Name"
            hint="Letters, numbers and underscores, eg. STRIPE_API_KEY"
            error={nameError}
          >
            <Input
              value={name}
              onChange={(e) => handleName(e.target.value)}
              placeholder="STRIPE_KEY"
              readOnly={fixedName !== null}
              className="font-mono"
              autoFocus={fixedName === null}
            />
          </FormField>
          <FormField label="Value" hint={valueHint} error={valueError}>
            <Input
              type={valueType}
              value={value}
              onChange={(e) => handleValue(e.target.value)}
              className="font-mono"
              autoFocus={fixedName !== null}
            />
          </FormField>
          <CheckboxCard
            checked={isSecret}
            onChange={setIsSecret}
            title="Secret"
            description="Hidden after you save. Workflows can still read it."
          />
          {places && widenable && (
            <ReachPicker
              choices={places}
              all={reachAll}
              onAllChange={handleReachAll}
              picked={picked}
              onPickedChange={handlePicked}
              locked={lockedIds}
              blocked={blockedIds}
            />
          )}
        </form>
      </ModalDialog>
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={handleDeleteOpenChange}
          title={`Delete ${fixedName}?`}
          description={deleteBody}
          confirmLabel="Delete variable"
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
