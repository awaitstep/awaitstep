import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Loader2, Play, Database } from 'lucide-react'
import { Button } from '../ui/button'

interface D1QueryPanelProps {
  connectionId: string
}

export function D1QueryPanel({ connectionId }: D1QueryPanelProps) {
  const [selectedDb, setSelectedDb] = useState<string | null>(null)
  const [sql, setSql] = useState('SELECT name FROM sqlite_master WHERE type="table"')

  const { data: databases, isLoading } = useQuery({
    queryKey: ['d1-databases', connectionId],
    queryFn: () =>
      fetch(`/api/resources/d1/databases?connectionId=${connectionId}`, { credentials: 'include' })
        .then((r) => r.json()),
    enabled: !!connectionId,
  })

  const queryMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/resources/d1/databases/${selectedDb}/query`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, sql }),
      }).then((r) => r.json()),
  })

  return (
    <div className="flex h-full gap-4">
      {/* Database list */}
      <div className="w-56 shrink-0 space-y-1">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Databases</h3>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {databases?.map((db: { uuid: string; name: string; num_tables: number }) => (
          <button
            key={db.uuid}
            onClick={() => setSelectedDb(db.uuid)}
            className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
              selectedDb === db.uuid ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5" />
              <span className="text-sm">{db.name}</span>
            </div>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">{db.num_tables} tables</span>
          </button>
        ))}
      </div>

      {/* Query panel */}
      <div className="flex flex-1 flex-col gap-3">
        {selectedDb && (
          <>
            <div className="space-y-2">
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-background p-3 font-mono text-sm outline-none focus:border-primary/50"
                placeholder="SELECT * FROM ..."
              />
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => queryMutation.mutate()}
                disabled={queryMutation.isPending || !sql.trim()}
              >
                {queryMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Run Query
              </Button>
            </div>

            {queryMutation.data && (
              <div className="flex-1 overflow-auto">
                {queryMutation.data.map((result: { columns: string[]; rows: unknown[][] }, i: number) => (
                  <table key={i} className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        {result.columns.map((col: string) => (
                          <th
                            key={col}
                            className="border border-border bg-muted px-3 py-1.5 text-left text-xs font-medium text-muted-foreground"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row: unknown[], j: number) => (
                        <tr key={j}>
                          {row.map((cell: unknown, k: number) => (
                            <td key={k} className="border border-border px-3 py-1.5 font-mono text-xs">
                              {cell === null ? <span className="text-muted-foreground">NULL</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
