import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Breadcrumb } from '../../../components/ui/breadcrumb'
import { api } from '../../../lib/api-client'
import { queries, flatPages } from '../../../lib/queries'
import { RequireOrg } from '../../../wrappers/require-org'
import { envVarsToString, parseEnvString } from '../../../lib/env-var-parser'
import type { EnvVarSummary } from '../../../lib/api-client'

export const Route = createFileRoute('/_authed/resources/env-vars')({
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
  const lineCount = text.split('\n').length

  const handleSave = async () => {
    if (errors.length > 0) {
      toast.error('Fix errors before saving')
      return
    }

    setSaving(true)
    try {
      const existingByName = new Map(envVars.map((v: EnvVarSummary) => [v.name, v]))
      const parsedNames = new Set(parsed.map((p) => p.name))

      for (const existing of envVars) {
        if (!parsedNames.has(existing.name)) {
          await api.deleteEnvVar(existing.id)
        }
      }

      for (const line of parsed) {
        if (!line.name) continue
        const existing = existingByName.get(line.name)
        const isUnchangedSecret = line.value === '••••••••' || line.value === ''

        if (existing) {
          const updates: { name?: string; value?: string; isSecret?: boolean } = {}
          if (!isUnchangedSecret && line.value !== existing.value) updates.value = line.value
          if (line.isSecret !== existing.isSecret) updates.isSecret = line.isSecret
          if (Object.keys(updates).length > 0) {
            await api.updateEnvVar(existing.id, updates)
          }
        } else {
          if (isUnchangedSecret) {
            toast.error(`New variable ${line.name} needs a value`)
            setSaving(false)
            return
          }
          await api.createEnvVar({ name: line.name, value: line.value, isSecret: line.isSecret })
        }
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
    <div className="flex h-full flex-col">
      <Breadcrumb
        items={[{ label: 'Resources', href: '/resources' }, { label: 'Environment Variables' }]}
      />
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold">Environment Variables</h1>
          <p className="text-xs text-muted-foreground">
            Global secrets and variables available to all workflows
          </p>
        </div>
        <Button
          size="sm"
          className="ml-auto"
          onClick={handleSave}
          disabled={!isDirty || saving || errors.length > 0}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="w-full">
        <div className="relative rounded-md border border-border bg-muted/10 font-mono text-sm">
          <div className="pointer-events-none absolute left-0 top-0 select-none px-3 py-3 text-right text-muted-foreground/40">
            {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
              <div key={i} className="leading-6">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              '# One variable per line\n# Prefix with SECRET_ to mark as secret\nSECRET_MY_API_KEY=sk_live_abc123\nDATABASE_URL=postgres://...'
            }
            className="w-full resize-none bg-transparent py-3 pl-10 pr-3 leading-6 outline-none placeholder:text-muted-foreground/30"
            rows={Math.max(lineCount + 2, 6)}
            spellCheck={false}
          />
        </div>

        {errors.length > 0 && (
          <div className="mt-2 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-destructive">
                <span className="font-mono font-medium">{e.name || '(empty)'}</span>: {e.error}
              </p>
            ))}
          </div>
        )}

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
