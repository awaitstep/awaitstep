import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Square,
  Terminal,
  X,
} from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { cn } from '../../lib/utils'
import { copyToClipboard } from '../../lib/utils'
import { parseAnsi, type AnsiSegment } from '../../lib/ansi'
import { useLocalDev } from '../../hooks/use-local-dev'
import { useLocalTestStore } from '../../stores/local-test-store'

interface LocalTestPanelProps {
  workflowId: string
}

export function LocalTestPanel({ workflowId }: LocalTestPanelProps) {
  const {
    state,
    info,
    error,
    warnings,
    triggerError,
    triggerResult,
    instanceId,
    instanceStatus,
    isTriggering,
    logs,
    start,
    stop,
    trigger,
    refresh,
  } = useLocalDev(workflowId)
  const triggerInput = useLocalTestStore((s) => s.triggerInput)
  const setTriggerInput = useLocalTestStore((s) => s.setTriggerInput)
  const mode = useLocalTestStore((s) => s.mode)
  const closeRequested = useLocalTestStore((s) => s.closeRequested)
  const requestClose = useLocalTestStore((s) => s.requestClose)
  const [inputError, setInputError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [closePrompt, setClosePrompt] = useState(false)
  const handledClose = useRef(0)

  useEffect(() => {
    if (closeRequested === handledClose.current) return
    handledClose.current = closeRequested
    if (state === 'running') setClosePrompt(true)
    else useLocalTestStore.getState().close()
  }, [closeRequested, state])

  function keepRunning() {
    setClosePrompt(false)
    useLocalTestStore.getState().close()
  }

  async function stopAndClose() {
    setClosePrompt(false)
    await stop()
    useLocalTestStore.getState().close()
  }

  const validJson = useMemo(() => {
    try {
      JSON.parse(triggerInput)
      return true
    } catch {
      return false
    }
  }, [triggerInput])

  function handleTrigger() {
    setInputError(null)
    try {
      trigger(JSON.parse(triggerInput))
    } catch {
      setInputError('Invalid JSON')
    }
  }

  function handleFormat() {
    try {
      setTriggerInput(JSON.stringify(JSON.parse(triggerInput), null, 2))
      setInputError(null)
    } catch {
      setInputError('Invalid JSON')
    }
  }

  async function handleCopyServer() {
    if (!info) return
    await copyToClipboard(info.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-lg font-semibold">Local test</span>
          {state === 'running' && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-2xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void refresh()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={requestClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {state === 'idle' || state === 'error' ? (
          <div className="space-y-4 p-5">
            <p className="text-sm leading-6 text-muted-foreground">
              Start a local dev server to test your workflow without deploying. No provider
              credentials required.
            </p>
            {error && (
              <p className="rounded-md bg-status-error/10 p-3 text-xs text-status-error">{error}</p>
            )}
            <Button className="w-full gap-2" onClick={() => start(mode)}>
              <Play className="h-4 w-4" />
              Start local server
            </Button>
          </div>
        ) : state === 'starting' ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting wrangler dev…
          </div>
        ) : state === 'stopping' ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Stopping…
          </div>
        ) : state === 'running' && info ? (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
              {warnings.length > 0 && (
                <div className="space-y-1 rounded-md bg-status-warning/10 p-3 text-xs text-status-warning">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  Server
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={info.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {info.url.replace(/^https?:\/\//, '')}
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void handleCopyServer()}
                    title="Copy server URL"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <a
                      href={info.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open server"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                    Trigger payload
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
                        validJson
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-status-error/10 text-status-error',
                      )}
                    >
                      <span className="h-1 w-1 rounded-full bg-current" />
                      {validJson ? 'Valid JSON' : 'Invalid JSON'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-2xs"
                      onClick={handleFormat}
                    >
                      <span className="font-mono">{'{}'}</span>
                      Format
                    </Button>
                  </div>
                </div>
                <textarea
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  className={cn(
                    'h-44 w-full resize-none rounded-lg border bg-muted/20 p-3 font-mono text-sm leading-6 text-foreground outline-none',
                    inputError ? 'border-red-500/50' : 'border-border focus:border-primary/50',
                  )}
                  spellCheck={false}
                  placeholder="{}"
                />
                {inputError && <p className="text-xs text-status-error">{inputError}</p>}
                {!inputError && triggerError && (
                  <p role="alert" className="text-xs text-status-error">
                    {triggerError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 bg-emerald-500 text-white hover:bg-emerald-400"
                  onClick={handleTrigger}
                  disabled={isTriggering}
                >
                  {isTriggering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Trigger
                </Button>
                <Button variant="outline" className="gap-2 px-5" onClick={stop}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>

              {triggerResult !== null && (
                <div className="space-y-1.5">
                  <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                    Response
                  </span>
                  <pre className="max-h-32 overflow-auto rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs leading-5 text-foreground/80">
                    {JSON.stringify(triggerResult, null, 2)}
                  </pre>
                </div>
              )}

              {instanceId && (
                <div className="space-y-1.5">
                  <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                    Instance{' '}
                    <span className="font-mono normal-case tracking-normal">
                      {instanceId.slice(0, 12)}…
                    </span>
                  </span>
                  {instanceStatus !== null && instanceStatus !== undefined && (
                    <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs leading-5 text-foreground/80">
                      {JSON.stringify(instanceStatus, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
            <LogViewer logs={logs} />
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={closePrompt}
        onOpenChange={setClosePrompt}
        title="Keep the local server running?"
        description="Closing the panel does not have to end the session. The server keeps running so you can reopen it from the canvas or the IDE."
        confirmLabel="Stop server"
        secondaryLabel="Keep running"
        cancelLabel="Cancel"
        variant="destructive"
        loading={state === 'stopping'}
        onSecondary={keepRunning}
        onConfirm={() => void stopAndClose()}
      />
    </div>
  )
}

function LogViewer({ logs }: { logs: ReturnType<typeof useLocalDev>['logs'] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const [clearedAt, setClearedAt] = useState(0)

  const visible = useMemo(
    () => logs.filter((entry) => entry.timestamp > clearedAt),
    [logs, clearedAt],
  )

  useEffect(() => {
    const el = containerRef.current
    if (el && follow) el.scrollTop = el.scrollHeight
  }, [visible, follow])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 30)
  }

  return (
    <div className="flex min-h-[220px] flex-1 flex-col border-t border-border">
      <div className="flex items-center justify-between px-5 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Logs
          </span>
          <span className="text-2xs text-muted-foreground/50">{visible.length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 px-2 text-2xs', follow && 'bg-muted text-foreground')}
            onClick={() => setFollow((value) => !value)}
          >
            Follow
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-2xs"
            onClick={() => setClearedAt(Date.now())}
          >
            Clear
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto border-t border-border/60 bg-[#09090b] px-4 py-3 font-mono text-xs leading-5"
      >
        {visible.length === 0 ? (
          <span className="text-muted-foreground/40">Waiting for output…</span>
        ) : (
          visible.map((entry, index) => (
            <LogLine key={`${entry.timestamp}-${index}`} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}

function LogLine({ entry }: { entry: ReturnType<typeof useLocalDev>['logs'][number] }) {
  const segments = parseAnsi(entry.text.replace(/\r/g, ''))
  const fallback = entry.stream === 'stderr' ? 'text-red-300' : 'text-zinc-300'
  return (
    <div className="flex gap-3 whitespace-pre-wrap break-words">
      <span className="w-[62px] shrink-0 select-none text-zinc-600">
        {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false })}
      </span>
      <span className={fallback}>
        {segments.map((segment: AnsiSegment, index: number) => (
          <span
            key={index}
            style={{
              color: segment.color,
              backgroundColor: segment.background,
              fontWeight: segment.bold ? 700 : undefined,
              opacity: segment.dim ? 0.65 : undefined,
            }}
          >
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  )
}
