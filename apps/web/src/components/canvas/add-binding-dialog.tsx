import { useState } from 'react'
import type { ResourceDeclaration } from '@awaitstep/ir'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import type { ClientBindingType } from '@awaitstep/provider-cloudflare/codegen'
import { FormField } from '../ui/form-field'

const BINDING_OPTIONS: Array<{ value: ClientBindingType; label: string }> = [
  { value: 'kv', label: 'KV namespace' },
  { value: 'd1', label: 'D1 database' },
  { value: 'r2', label: 'R2 bucket' },
  { value: 'queue', label: 'Queue' },
  { value: 'ai', label: 'Workers AI' },
  { value: 'vectorize', label: 'Vectorize index' },
  { value: 'analytics_engine', label: 'Analytics Engine' },
  { value: 'hyperdrive', label: 'Hyperdrive' },
  { value: 'browser', label: 'Browser Rendering' },
  { value: 'service', label: 'Service binding' },
]

const RESOURCE_LABELS: Partial<Record<ClientBindingType, string>> = {
  r2: 'Bucket name',
  queue: 'Queue name',
  vectorize: 'Index name',
  service: 'Service name',
  workflow: 'Workflow binding name',
}

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

interface AddBindingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingNames: readonly string[]
  onAdd: (resource: ResourceDeclaration) => void
}

export function AddBindingDialog({
  open,
  onOpenChange,
  existingNames,
  onAdd,
}: AddBindingDialogProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ClientBindingType>('kv')
  const [resourceName, setResourceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const resourceLabel = RESOURCE_LABELS[kind]

  function reset() {
    setName('')
    setKind('kv')
    setResourceName('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleAdd() {
    const bindingName = name.trim().toUpperCase()
    if (!NAME_PATTERN.test(bindingName)) {
      setError('Use letters, digits and underscores, starting with a letter or underscore.')
      return
    }
    if (existingNames.includes(bindingName)) {
      setError(`${bindingName} is already declared.`)
      return
    }
    const bindingResource = resourceName.trim()
    onAdd({
      name: bindingName,
      kind,
      provider: 'cloudflare',
      ...(bindingResource && { resourceName: bindingResource }),
    })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add Cloudflare binding</DialogTitle>
          <DialogDescription>
            Declare the resource here. The physical namespace, database or bucket is chosen when you
            deploy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label="Type">
            <Select
              id="binding-kind"
              value={kind}
              onValueChange={(value) => setKind(value as ClientBindingType)}
              options={BINDING_OPTIONS}
            />
          </FormField>

          <FormField
            label="Binding name"
            hint={
              <p className="text-[11px] text-muted-foreground">
                This is the name your step code uses, e.g. <code>kv(env, 'KV_USERS')</code>.
              </p>
            }
          >
            <Input
              id="binding-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              placeholder="KV_USERS"
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>

          {resourceLabel && (
            <FormField label={resourceLabel} error={error}>
              <Input
                id="binding-resource"
                value={resourceName}
                onChange={(event) => setResourceName(event.target.value)}
                placeholder="Optional — defaults to the binding name"
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={handleAdd}>Add binding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
