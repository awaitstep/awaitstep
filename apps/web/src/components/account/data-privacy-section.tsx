import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Download, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { api } from '../../lib/api-client'
import { authClient, handleSignOut } from '../../lib/auth-client'

export function DataPrivacySection() {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const [workflowsResult, connectionsResult, runsResult] = await Promise.all([
        api.listWorkflows(),
        api.listConnections(),
        api.listAllRuns(),
      ])
      const data = {
        workflows: workflowsResult.data,
        connections: connectionsResult.data,
        runs: runsResult.data,
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `awaitstep-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.deleteUser()
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      handleSignOut()
    },
  })

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Data & Privacy
      </h2>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Export your data</p>
          <p className="text-xs text-muted-foreground">Download account data as JSON</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={exporting}
          onClick={handleExport}
        >
          {exporting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Export
        </Button>
      </div>

      <div className="my-3 h-px bg-border" />

      <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-status-error">Danger Zone</p>
            <p className="text-xs text-muted-foreground">Permanently delete your account</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete account"
        description="This will permanently delete your account, all workflows, connections, and deployment history. This cannot be undone."
        confirmLabel="Delete my account"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </section>
  )
}
