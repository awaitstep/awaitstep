import { useState, useRef, useEffect } from 'react'
import { Play, Square, Loader2, ExternalLink, Send, Terminal, X, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { useLocalDev, type LogEntry } from '../../hooks/use-local-dev'

interface LocalTestPanelProps {
  workflowId: string
  onClose: () => void
}

export function LocalTestPanel({ workflowId, onClose }: LocalTestPanelProps) {
  const {
    state,
    info,
    error,
    triggerResult,
    instanceId,
    instanceStatus,
    isTriggering,
    logs,
    start,
    stop,
    trigger,
    checkInstance,
  } = useLocalDev(workflowId)
  const [triggerInput, setTriggerInput] = useState('{}')
  const [inputError, setInputError] = useState<string | null>(null)

  function handleClose() {
    if (state === 'running') stop()
    onClose()
  }

  function handleTrigger() {
    setInputError(null)
    try {
      const params = JSON.parse(triggerInput)
      trigger(params)
    } catch {
      setInputError('Invalid JSON')
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Local Test</span>
          {state === 'running' && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-status-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-success" />
              Running
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {state === 'idle' || state === 'error' ? (
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Start a local dev server to test your workflow without deploying. No Cloudflare
              credentials required.
            </p>
            {error && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}
            <Button size="sm" className="w-full gap-1.5" onClick={() => start()}>
              <Play className="h-3.5 w-3.5" />
              Start Local Server
            </Button>
          </div>
        ) : state === 'starting' ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Starting wrangler dev...
          </div>
        ) : state === 'stopping' ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Stopping...
          </div>
        ) : state === 'running' && info ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Server info + trigger */}
            <div className="shrink-0 space-y-3 border-b border-border p-4">
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5">
                <span className="text-[11px] text-muted-foreground">Server</span>
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                >
                  {info.url}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">Trigger payload</label>
                <textarea
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  className={cn(
                    'h-16 w-full resize-none rounded-md border bg-muted/30 p-2 font-mono text-[11px] text-foreground outline-none',
                    inputError ? 'border-red-500/50' : 'border-border focus:border-primary/50',
                  )}
                  placeholder="{}"
                />
                {inputError && <p className="text-[10px] text-red-400">{inputError}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={handleTrigger}
                    disabled={isTriggering}
                  >
                    {isTriggering ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Trigger
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={stop}>
                    <Square className="h-3 w-3" />
                    Stop
                  </Button>
                </div>
              </div>

              {triggerResult !== null && (
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Response</span>
                  <pre className="max-h-20 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] text-foreground/70">
                    {JSON.stringify(triggerResult, null, 2)}
                  </pre>
                </div>
              )}

              {instanceId && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      Instance{' '}
                      <span className="font-mono text-foreground/70">
                        {instanceId.slice(0, 12)}...
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-[10px]"
                      onClick={checkInstance}
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      Check Status
                    </Button>
                  </div>
                  {instanceStatus !== null && instanceStatus !== undefined && (
                    <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] text-foreground/70">
                      {JSON.stringify(instanceStatus, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Log viewer */}
            <LogViewer logs={logs} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function LogViewer({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (el && isAtBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
        <Terminal className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Logs</span>
        <span className="text-[10px] text-muted-foreground/50">{logs.length} lines</span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-background p-3 font-mono text-[11px] leading-5"
      >
        {logs.length === 0 ? (
          <span className="text-muted-foreground/50">Waiting for output...</span>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 select-none text-muted-foreground/50">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={entry.stream === 'stderr' ? 'text-red-400' : 'text-foreground'}>
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
