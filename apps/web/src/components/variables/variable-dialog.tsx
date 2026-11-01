import { useId, useState, type SubmitEvent } from 'react'
import { Braces, Trash2 } from 'lucide-react'
import { isEnvVarName } from '@awaitstep/ir'
import { errorFieldOf } from '../../data/dashboard/errors'
import { ApiError } from '../../lib/api-client'
import { useDeleteVariable, useSetVariable } from '../../data/dashboard/variables'
import type { VariableLevel, VariableScope } from '../../types/dashboard/variables'
import { Button } from '../ui/button'
import { CheckboxCard } from '../ui/choice-card'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'
import { Banner } from '../ui/banner'

/** A place a variable can be set, as "Applies to" lists it. */
export interface VariableTarget {
  /** `org`, `project`, or `ws:<slug>`. */
  id: string
  label: string
  scope: VariableScope
  /** Its name, for "Already set in …" and titles. */
  name: string
}

/** What the dialog does: add, change one value, or override an inherited one. */
export type VariableDialogMode =
  | { kind: 'new' }
  | { kind: 'edit'; id: string; name: string; value: string | null; isSecret: boolean }
  | { kind: 'override'; name: string; isSecret: boolean }

const NAME_RULE = 'Use capital letters, numbers and underscores, starting with a letter'

interface VariableDialogProps {
  org: string
  mode: VariableDialogMode
  /** The places the viewer may set variables (D-P6-7), narrowest last. */
  targets: VariableTarget[]
  /** Where the dialog starts: the page's own level. */
  startTarget: string
  onClose: () => void
}

const LEVEL_ORDER: VariableLevel[] = ['organization', 'project', 'workspace']

/**
 * `NewVariable`: name, value, secret, and where it applies. Also Edit
 * (`?variable=NAME`, set here) and Override (`?variable=NAME`, inherited), with the name
 * fixed (D-P6-4..6).
 */
export function VariableDialog({ org, mode, targets, startTarget, onClose }: VariableDialogProps) {
  const formId = useId()
  const save = useSetVariable(org)
  const remove = useDeleteVariable(org)
  const fixedName = mode.kind === 'new' ? null : mode.name
  const [name, setName] = useState(fixedName ?? '')
  const [value, setValue] = useState(
    mode.kind === 'edit' && !mode.isSecret ? (mode.value ?? '') : '',
  )
  const [isSecret, setIsSecret] = useState(mode.kind === 'new' ? false : mode.isSecret)
  const [targetId, setTargetId] = useState(startTarget)
  const [deleting, setDeleting] = useState(false)
  // The name as the API and a reference accept it: checked here before a
  // request, so a typo never waits on a round trip.
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined)
  // No fallback: a target that isn't listed yet waits, rather than saving somewhere broader.
  const target = targets.find((t) => t.id === targetId)

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

  function handleTarget(next: string) {
    setTargetId(next)
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
  const shownName = name.trim() || 'NAME'
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
  const levelFixed = mode.kind !== 'new'
  const submitLabel =
    mode.kind === 'new' ? 'Add variable' : mode.kind === 'edit' ? 'Save' : 'Override'
  const narrowest = [...targets].sort(
    (a, b) => LEVEL_ORDER.indexOf(b.scope.level) - LEVEL_ORDER.indexOf(a.scope.level),
  )[0]
  const canSubmit = !save.isPending && target !== undefined
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
  const levelHint = `The narrower level applies: ${narrowest?.name ?? 'a workspace'} would replace the levels above it.`

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
            hint={`Letters, numbers and underscores. Workflows read it as global.env.${shownName}.`}
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
          <FormField label="Applies to" hint={levelHint}>
            <Select
              value={targetId}
              onValueChange={handleTarget}
              options={targets.map((t) => ({ value: t.id, label: t.label }))}
              disabled={levelFixed}
            />
          </FormField>
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
