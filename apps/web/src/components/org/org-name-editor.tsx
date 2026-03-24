import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authClient } from '../../lib/auth-client'
import { useOrgStore, type Organization } from '../../stores/org-store'
import { toast } from 'sonner'

export function OrgNameEditor({ org }: { org: Organization }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(org.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const setOrgs = useOrgStore((s) => s.setOrganizations)
  const orgs = useOrgStore((s) => s.organizations)

  useEffect(() => {
    setValue(org.name)
  }, [org.name])
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await authClient.organization.update({ organizationId: org.id, data: { name } })
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: (_data, name) => {
      setOrgs(orgs.map((o) => (o.id === org.id ? { ...o, name } : o)))
      toast.success('Organization updated')
    },
    onError: (err) => toast.error(err.message),
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
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xl font-semibold outline-none focus:border-primary/50"
        />
      </div>
    )
  }

  return (
    <div className="mt-6">
      <p
        onClick={() => setEditing(true)}
        className="cursor-text rounded-md px-2 py-1 text-xl font-semibold transition-colors hover:bg-muted/40"
        title="Click to rename"
      >
        {org.name}
      </p>
    </div>
  )
}
