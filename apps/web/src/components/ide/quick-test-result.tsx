import { Copy } from 'lucide-react'
import { actionToast } from '../../lib/action-toast'
import { QUICK_TEST_TIMEOUT_MS, type QuickTestResult } from '../../lib/ide/quick-test-runner'
import { cn, copyToClipboard } from '../../lib/utils'
import { Button } from '../ui/button'

// `aborted` is never stored — settleRun drops it — but the map is total so
// an unexpected status can never render as a blank header.
const STATUS_STYLES: Record<QuickTestResult['status'], string> = {
  ok: 'text-status-success',
  error: 'text-status-error',
  timeout: 'text-status-warning',
  refused: 'text-status-warning',
  aborted: 'text-muted-foreground',
}

const STATUS_LABELS: Record<QuickTestResult['status'], string> = {
  ok: 'Returned',
  error: 'Threw',
  timeout: 'Timed out',
  // Not "Threw": the step never ran, so saying it threw blames code that
  // was never reached.
  refused: 'Didn’t run',
  aborted: 'Stopped',
}

/** What "Copy result" puts on the clipboard: the return value, else the error. */
export function resultText(result: QuickTestResult): string {
  if (result.status === 'ok') return result.result || 'undefined'
  return result.error?.message ?? ''
}

export function QuickTestResultView({
  result,
  running,
}: {
  result: QuickTestResult | null
  running: boolean
}) {
  if (running && !result) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Running. It stops after {QUICK_TEST_TIMEOUT_MS / 1000} seconds.
      </p>
    )
  }
  if (!result) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        The result, console output and any error appear here.
      </p>
    )
  }

  function handleCopy() {
    copyToClipboard(resultText(result!))
      .then(() => actionToast.success('Result copied'))
      .catch(() => actionToast.error('Couldn’t copy the result'))
  }

  const copyable = resultText(result) !== ''

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('text-2xs font-medium', STATUS_STYLES[result.status])}>
            {STATUS_LABELS[result.status]}
          </span>
          {/* No duration for something that never ran — "0 ms" reads as a
              measurement rather than an absence. */}
          {result.status !== 'refused' && (
            <span className="text-2xs tabular-nums text-muted-foreground">
              {result.durationMs} ms
            </span>
          )}
        </span>
        {copyable && (
          <Button size="sm" variant="ghost" onClick={handleCopy} className="h-6 px-2 text-xs">
            <Copy className="h-3 w-3" />
            Copy result
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {result.error && (
          // Message only. The worker's stack numbers lines in the generated
          // script — prelude, stub and transpiled output included — so every
          // frame would point somewhere the file on screen does not have.
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-status-error">
            {result.error.message}
          </pre>
        )}
        {result.status === 'ok' && (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
            {result.result || 'undefined'}
          </pre>
        )}
        {result.logs.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <div className="mb-1 text-2xs font-medium text-muted-foreground">
              Console · {result.logs.length}
            </div>
            {result.logs.map((log, index) => (
              <pre
                key={index}
                className={cn(
                  'whitespace-pre-wrap break-words font-mono text-2xs',
                  log.level === 'error' && 'text-status-error',
                  log.level === 'warn' && 'text-status-warning',
                  log.level === 'info' && 'text-muted-foreground',
                )}
              >
                {log.text}
              </pre>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
