import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Breadcrumb } from '../../../components/ui/breadcrumb'
import { D1QueryPanel } from '../../../components/resources/d1-query-panel'
import { RequireOrg } from '../../../wrappers/require-org'

export const Route = createFileRoute('/_authed/resources/d1')({
  component: D1Page,
})

function D1Page() {
  return (
    <RequireOrg>
      <D1Content />
    </RequireOrg>
  )
}

function D1Content() {
  const [connectionId, setConnectionId] = useState('')

  return (
    <div className="flex h-full flex-col">
      <Breadcrumb items={[{ label: 'Resources', href: '/resources' }, { label: 'D1 Databases' }]} />
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold">D1 Databases</h1>
        <input
          type="text"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          placeholder="Connection ID"
          className="ml-auto w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary/50"
        />
      </div>
      {connectionId && <D1QueryPanel connectionId={connectionId} />}
    </div>
  )
}
