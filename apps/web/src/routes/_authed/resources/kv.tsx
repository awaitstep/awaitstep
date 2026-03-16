import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { KVBrowser } from '../../../components/resources/kv-browser'

export const Route = createFileRoute('/_authed/resources/kv')({
  component: KVPage,
})

function KVPage() {
  const [connectionId, setConnectionId] = useState('')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/resources">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
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
