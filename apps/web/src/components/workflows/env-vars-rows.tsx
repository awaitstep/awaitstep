import { useState } from 'react'
import { Braces, Eye, EyeOff, Globe, Link2, Lock, Plus, Trash2 } from 'lucide-react'
import { MASKED_SECRET_VALUE, splitSecretName } from '../../lib/env-var-parser'
import {
  linkedGlobal,
  needsValue,
  type DraftEnvRow,
  type EnvGroup,
} from '../../lib/workflows/env-vars'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const GROUP_LABEL: Record<EnvGroup, string> = {
  attention: 'Needs attention',
  secrets: 'Secrets',
  variables: 'Variables',
}

/** A group's heading: its name, how many rows it holds, and a rule to the edge. */
export function EnvGroupHeading({ group, count }: { group: EnvGroup; count: number }) {
  const alert = group === 'attention'
  return (
    <div
      className={cn(
        'mb-2 mt-4 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider first:mt-1',
        alert ? 'text-status-warning' : 'text-muted-foreground',
      )}
    >
      {GROUP_LABEL[group]}
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] font-medium normal-case tracking-normal',
          alert ? 'bg-status-warning/15 text-status-warning' : 'bg-muted text-foreground/80',
        )}
      >
        {count}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

interface EnvRowFieldsProps {
  row: DraftEnvRow
  disabled: boolean
  onChange: (patch: Partial<DraftEnvRow>) => void
  onToggleLink: () => void
  onRemove: () => void
}

/** One variable: name, value (or the global it points at), link and delete. */
export function EnvRowFields({
  row,
  disabled,
  onChange,
  onToggleLink,
  onRemove,
}: EnvRowFieldsProps) {
  const [revealed, setRevealed] = useState(false)
  const { isSecret } = splitSecretName(row.name.trim())
  const global = linkedGlobal(row.value)
  const missing = needsValue(row) && global === null
  const typed = row.value !== '' && row.value !== MASKED_SECRET_VALUE

  function handleName(event: React.ChangeEvent<HTMLInputElement>) {
    // No spaces in a name: one before SECRET_ would hide the prefix.
    onChange({ name: event.target.value.replace(/\s/g, '').toUpperCase() })
  }

  function handleValue(event: React.ChangeEvent<HTMLInputElement>) {
    onChange({ value: event.target.value })
  }

  function handleReveal() {
    setRevealed((shown) => !shown)
  }

  return (
    <div className="grid grid-cols-[minmax(0,184px)_minmax(0,1fr)_28px_28px] items-center gap-2">
      <Input
        aria-label="Variable name"
        value={row.name}
        onChange={handleName}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        placeholder="MY_API_KEY"
        className={cn('h-8 font-mono text-xs', missing && 'border-status-warning/50')}
      />
      {global !== null ? (
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 text-xs text-muted-foreground">
          <span className="inline-flex h-5 items-center gap-1 rounded bg-primary/10 px-1.5 text-[10.5px] font-medium text-primary">
            <Globe className="h-3 w-3" />
            Global
          </span>
          <span className="truncate font-mono text-[11.5px] text-foreground/80">{global}</span>
        </div>
      ) : (
        <div className="relative flex items-center">
          <Input
            aria-label="Value"
            type={isSecret && !revealed ? 'password' : 'text'}
            // Not a login: keep password managers from offering to save or fill it.
            autoComplete={isSecret ? 'new-password' : 'off'}
            data-1p-ignore=""
            data-lpignore="true"
            value={row.value}
            onChange={handleValue}
            disabled={disabled}
            spellCheck={false}
            placeholder={missing ? 'Needs a value' : 'value'}
            className={cn(
              'h-8 font-mono text-xs',
              missing && 'border-status-warning/60',
              isSecret && 'pr-28',
            )}
          />
          {isSecret && (
            <span className="absolute right-1.5 flex items-center gap-1">
              <span className="inline-flex h-5 items-center gap-1 rounded bg-primary/10 px-1.5 text-[10.5px] font-medium text-primary">
                <Lock className="h-3 w-3" />
                Encrypted
              </span>
              {typed && (
                <button
                  type="button"
                  onClick={handleReveal}
                  aria-label={revealed ? 'Hide value' : 'Reveal value'}
                  aria-pressed={revealed}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {disabled ? (
        <>
          <span />
          <span />
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggleLink}
            aria-label={global !== null ? 'Unlink from global' : 'Link to global'}
            aria-pressed={global !== null}
            title={
              global !== null ? 'Unlink from global' : 'Link to a global variable of this name'
            }
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
              global !== null && 'text-primary',
            )}
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Delete variable"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}

interface EmptyEnvVarsProps {
  canEdit: boolean
  onAdd: () => void
  onImport: () => void
}

/** Shown when there are no variables: what they are for, and the two ways to start. */
export function EmptyEnvVars({ canEdit, onAdd, onImport }: EmptyEnvVarsProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-6 py-8 text-center">
      <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Braces className="h-5 w-5" />
      </span>
      <p className="text-sm text-foreground">No variables yet</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Add a key your steps read with{' '}
        <code className="font-mono text-foreground/80">env.NAME</code>. Prefix{' '}
        <code className="font-mono text-foreground/80">SECRET_</code> to encrypt.
      </p>
      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add variable
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onImport}>
            Import from .env
          </Button>
        </div>
      )}
    </div>
  )
}
