import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { HelpTooltip } from '../../components/ui/help-tooltip'
import { EnvEditor } from '../../components/env-vars/env-editor'
import { api } from '../../lib/api-client'
import { queries, flatPages } from '../../lib/queries'
import { computeEnvVarOps } from '../../lib/env-var-diff'
import { envVarsToString, parseEnvString } from '../../lib/env-var-parser'
import { RequireOrg } from '../../wrappers/require-org'

export const Route = createFileRoute('/_authed/env-vars')({
  head: () => ({ meta: [{ title: 'Environment Variables | AwaitStep' }] }),
  component: EnvVarsPage,
})

function EnvVarsPage() {
  return (
    <RequireOrg>
      <EnvVarsContent />
    </RequireOrg>
  )
}

function EnvVarsContent() {
  const queryClient = useQueryClient()

  const { data: envVars = [], isLoading } = useInfiniteQuery({
    ...queries.envVars.list(),
    select: (data) => flatPages(data),
  })

  const serverText = useMemo(() => envVarsToString(envVars), [envVars])
  const [text, setText] = useState(serverText)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setText(serverText)
  }, [serverText])

  const isDirty = text !== serverText
  const parsed = useMemo(() => parseEnvString(text), [text])
  const errors = parsed.filter((p) => p.error)

  const handleSave = async () => {
    if (errors.length > 0) {
      toast.error('Fix errors before saving')
      return
    }

    const diff = computeEnvVarOps(envVars, parsed)
    if (!diff.ok) {
      toast.error(diff.error)
      return
    }

    setSaving(true)
    try {
      for (const op of diff.ops) {
        if (op.type === 'delete') await api.deleteEnvVar(op.id)
        else if (op.type === 'update') await api.updateEnvVar(op.id, op.updates)
        else await api.createEnvVar({ name: op.name, value: op.value, isSecret: op.isSecret })
      }

      await queryClient.invalidateQueries({ queryKey: ['env-vars'] })
      toast.success('Environment variables saved')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Environment Variables"
        actions={
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving || errors.length > 0}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        }
      />

      <div className="mt-4">
        <p className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
          Global secrets and variables available to all workflows
          <HelpTooltip
            title="Environment Variables"
            description="Prefix variable names with SECRET_ to encrypt their values. Secret values are masked and cannot be read back — replace the value to update. Variables are injected into all workflow deployments."
          />
        </p>
        <EnvEditor value={text} onChange={setText} errors={errors} />
        <p className="mt-2 text-xs text-muted-foreground">
          {isLoading
            ? 'Loading...'
            : `${envVars.length} variable${envVars.length === 1 ? '' : 's'}`}
          {isDirty && ' (unsaved changes)'}
          {
            ' · Prefix names with SECRET_ to encrypt · Secret values shown as •••••••• — replace to update'
          }
        </p>
      </div>
    </div>
  )
}
