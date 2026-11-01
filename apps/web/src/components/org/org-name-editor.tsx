import { useState, useRef, useEffect } from 'react'
import { failureLine } from '../../lib/action-toast'
import { authError } from '../../data/dashboard/errors'
import { useMutation } from '@tanstack/react-query'
import { authClient } from '../../lib/auth-client'
import { useOrgStore, type Organization } from '../../stores/org-store'

export function OrgNameEditor({ org }: { org: Organization }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(org.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const orgs = useOrgStore((s) => s.organizations)
  const { setOrganizations: setOrgs } = useOrgStore()

  useEffect(() => {
    setValue(org.name)
  }, [org.name])
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const mutation = useMutation({
    meta: { toast: { success: 'Organization saved', error: 'Couldn’t save the organization' } },
    mutationFn: async (name: string) => {
      const res = await authClient.organization.update({ organizationId: org.id, data: { name } })
      if (res.error) throw authError(res.error, 'Could not rename the organization')
    },
    onSuccess: (_data, name) => {
      setOrgs(orgs.map((o) => (o.id === org.id ? { ...o, name } : o)))
    },
    onError: () => setValue(org.name),
  })

  function save() {
    setEditing(false)
    const trimmed = value.trim()
    if (!trimmed || trimmed === org.name) {
      setValue(org.name)
      return
    }
    mutation.mutate(trimmed)
  }

  // A new edit starts without the last attempt's failure.
  function handleStartEditing() {
    mutation.reset()
    setEditing(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') {
      setValue(org.name)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-6">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-lg font-semibold tracking-tight outline-none focus:border-primary/50"
        />
      </div>
    )
  }

  return (
    <div className="mt-6">
      <p
        onClick={handleStartEditing}
        className="cursor-text rounded-md px-2 py-1 text-lg font-semibold tracking-tight transition-colors hover:bg-muted/40"
        title="Click to rename"
      >
        {org.name}
      </p>
      {mutation.error && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {failureLine(mutation.error, 'Couldn’t save the organization')}
        </p>
      )}
    </div>
  )
}
