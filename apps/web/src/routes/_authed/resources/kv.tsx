import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Breadcrumb } from '../../../components/ui/breadcrumb'
import { KVBrowser } from '../../../components/resources/kv-browser'
import { RequireOrg } from '../../../wrappers/require-org'

export const Route = createFileRoute('/_authed/resources/kv')({
  component: KVPage,
})

function KVPage() {
  return (
    <RequireOrg>
      <KVContent />
    </RequireOrg>
  )
}

function KVContent() {
  const [connectionId, setConnectionId] = useState('')

  return (
    <div className="flex h-full flex-col">
      <Breadcrumb
        items={[{ label: 'Resources', href: '/resources' }, { label: 'KV Namespaces' }]}
      />
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold">KV Namespaces</h1>
        <input
          type="text"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          placeholder="Connection ID"
          className="ml-auto w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary/50"
        />
      </div>
      {connectionId && <KVBrowser connectionId={connectionId} />}
    </div>
  )
}
