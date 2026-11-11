import { useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useApi, useQueries } from '../../contexts/api-client-context'
import type { FunctionCallResponse } from '@awaitstep/codegen'
import { failureLine } from '../../lib/action-toast'
import { runCurl, runEndpoint } from '../../lib/workflows/run-endpoint'
import { Badge } from '../ui/badge'
import { CopyCommand } from '../ui/copy-command'
import { ShellLink } from '../ui/shell-link'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { Tile } from '../ui/tile'
import { jsonProblem, NOT_CALLABLE, prettyBody } from './function-call'

interface FunctionCallDialogProps {
  workflowId: string
  /** Where a recorded call's run page is. */
  runHref: (runId: string) => string
  onClose: () => void
}

function statusVariant(status: number): 'success' | 'error' | 'neutral' {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 400) return 'error'
  return 'neutral'
}

/**
 * Call a live function (24i): POST a JSON body to it from the server and see
 * what it answers, with the curl that makes the same call through the API
 * (D-8). Each call is recorded as one of the function's runs.
 */
export function FunctionCallDialog({ workflowId, runHref, onClose }: FunctionCallDialogProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const queries = useQueries()
  // Where it is live: a call goes to one of these accounts' URL.
  const targets = useQuery(queries.connections.forDeploy(workflowId))
  const live = targets.data?.deployedWith ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const target = live.find((l) => l.id === picked) ?? live[0]
  const [body, setBody] = useState('{}')
  const [sending, setSending] = useState(false)
  // Each answer belongs to the account it came from: switching shows none.
  const [answer, setAnswer] = useState<{
    connectionId: string
    response: FunctionCallResponse
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const problem = jsonProblem(body)
  // Which URLs the provider calls is the server's to decide: it sends `callable`.
  const blocked = target && !target.callable ? NOT_CALLABLE : null
  const shown = answer && answer.connectionId === target?.id ? answer.response : null
  // The account is named only when there is a choice: alone, it is the one used.
  const account = live.length > 1 ? target?.id : undefined
  const endpoint = runEndpoint(workflowId)
  const curl = target ? runCurl(workflowId, { account, body }) : undefined

  function handlePick(id: string) {
    setPicked(id)
    setAnswer(null)
    setError(null)
  }

  function handleBodyChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
  }

  function handleOpenChange(open: boolean) {
    if (!open && !sending) onClose()
  }

  async function handleSend() {
    if (!target || problem || blocked) return
    const connectionId = target.id
    setSending(true)
    setError(null)
    try {
      const response = await api.callFunction(workflowId, { connectionId, body })
      setAnswer({ connectionId, response })
      // It is one of the function's runs now: its list and counts move.
      void queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      void queryClient.invalidateQueries({ queryKey: ['dash', 'workflow-run-counts'] })
      void queryClient.invalidateQueries({ queryKey: ['dash', 'workflow-summary', workflowId] })
    } catch (err) {
      setAnswer(null)
      setError(failureLine(err, 'Couldn’t call the function'))
    } finally {
      setSending(false)
    }
  }

  let description = 'Not live on any account yet.'
  if (target) {
    description =
      target.version !== null
        ? `v${target.version}, live on ${target.name}`
        : `Live on ${target.name}`
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="lg"
      leading={
        <Tile tone="ok" size="lg">
          <Play />
        </Tile>
      }
      title="Call this function"
      description={description}
      footerStart={
        <span className="text-xs text-muted-foreground">
          Calls the live version. Each call is kept in Runs.
        </span>
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
            Close
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!target || problem !== null || blocked !== null}
            loading={sending}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {live.length > 1 && (
          <FormField label="Account">
            <Select
              aria-label="Account"
              disabled={sending}
              value={target?.id ?? ''}
              onValueChange={handlePick}
              options={live.map((l) => ({ value: l.id, label: l.name }))}
            />
          </FormField>
        )}
        {target && (
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Badge variant="info" className="font-semibold tracking-wider">
              POST
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
              {endpoint.replace(/^https?:\/\//, '')}
            </span>
          </span>
        )}
        <FormField label="Body" error={problem ?? undefined}>
          <Textarea
            value={body}
            onChange={handleBodyChange}
            spellCheck={false}
            rows={4}
            className="resize-none font-mono text-xs"
            placeholder='{ "key": "value" }'
          />
        </FormField>
        {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
        {shown?.ok && <CallAnswer answer={shown} />}
        {shown && !shown.ok && (
          <p role="alert" className="text-xs text-status-error">
            {shown.reason}
          </p>
        )}
        {shown && (
          <ShellLink
            href={runHref(shown.runId)}
            className="self-start text-xs font-medium text-primary hover:underline"
          >
            Open this run →
          </ShellLink>
        )}
        {error && (
          <p role="alert" className="text-xs text-status-error">
            {error}
          </p>
        )}
        {curl && <CopyCommand command={curl} label="Copy the curl command" />}
      </div>
    </ModalDialog>
  )
}

function CallAnswer({ answer }: { answer: Extract<FunctionCallResponse, { ok: true }> }) {
  return (
    <section aria-label="Response" className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs font-medium text-foreground">Response</span>
        <Badge variant={statusVariant(answer.status)}>
          {`${answer.status} ${answer.statusText}`.trim()}
        </Badge>
        <span className="text-xs text-muted-foreground">{answer.durationMs} ms</span>
      </span>
      <pre className="m-0 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground">
        {prettyBody(answer.body, answer.contentType) || '(empty)'}
      </pre>
      {answer.truncated && (
        <span className="text-xs text-muted-foreground">Only the first 100 KB is shown.</span>
      )}
    </section>
  )
}
