import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { useDeleteAccount, useExportAccount } from '../../data/dashboard/account'
import { dashboardPath } from '../../lib/dashboard-paths'
import { downloadJsonFile } from '../../lib/download-file'
import type { Account } from '../../types/dashboard/account'
import { BlockedAction } from '../ui/blocked-action'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { SectionHeader } from '../ui/section-header'
import { useGoTo } from '../navigation/router-shell-link'
import { exportFileName } from './account-format'

interface YourDataSectionProps {
  account: Account
  /** The org in the URL; deleting the account leaves it. */
  currentOrg: string
}

/** Your data (`AccountProfile`): Download JSON, and Delete account. */
export function YourDataSection({ account, currentOrg }: YourDataSectionProps) {
  const exporter = useExportAccount()
  const remove = useDeleteAccount(currentOrg)
  const goTo = useGoTo()
  const [deleting, setDeleting] = useState(false)
  const email = account.person.email

  function handleExport() {
    exporter.mutate(undefined, {
      onSuccess: (data) => downloadJsonFile(exportFileName(), JSON.stringify(data, null, 2)),
    })
  }

  function handleOpenDelete() {
    remove.reset()
    setDeleting(true)
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDeleting(false)
  }

  function handleDelete() {
    // The dialog holds Delete until the email is typed, so what was typed is the email.
    remove.mutate(email, { onSuccess: () => goTo(dashboardPath()) })
  }

  return (
    <section className="settings-width flex flex-col gap-3">
      <SectionHeader title="Your data" />
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        <DataRow
          title="Export your data"
          description="Download your profile, sign-in methods, sessions and memberships as JSON."
          action={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporter.isPending}
              >
                {exporter.isSuccess ? 'Downloaded' : 'Download JSON'}
              </Button>
              {exporter.error && (
                <span role="alert" className="text-2xs text-status-error">
                  {exporter.error.message}
                </span>
              )}
            </>
          }
        />
        <DataRow
          danger
          title="Delete your account"
          description="Signs you out everywhere and removes you from every organization. Workflows you built stay with their organization."
          action={
            <BlockedAction reason={account.deleteBlockedReason ?? undefined}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-status-error"
                onClick={handleOpenDelete}
              >
                Delete account
              </Button>
            </BlockedAction>
          }
        />
      </div>
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={handleDeleteOpenChange}
          icon={Trash2}
          title="Delete your account?"
          description={
            remove.error?.message ??
            'You’re signed out everywhere and removed from every organization. It can’t be undone. Type your email to confirm.'
          }
          confirmLabel="Delete account"
          confirmText={email}
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}
    </section>
  )
}

interface DataRowProps {
  title: string
  description: string
  /** Red title: Delete account. */
  danger?: boolean
  /** The button, with any reason or error under it. */
  action: ReactNode
}

function DataRow({ title, description, danger, action }: DataRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <span
          className={danger ? 'text-sm font-semibold text-status-error' : 'text-sm font-semibold'}
        >
          {title}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      </div>
      <div className="flex flex-col items-start gap-1.5 sm:items-end">{action}</div>
    </div>
  )
}
