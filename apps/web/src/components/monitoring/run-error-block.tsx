import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { parseRunError } from '../../lib/parse-run-error'
import { copyToClipboard } from '../../lib/utils'

export function RunErrorBlock({ error }: { error: unknown }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const parsed = parseRunError(error)

  function handleCopy() {
    copyToClipboard(parsed.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleToggleRaw() {
    setShowRaw(!showRaw)
  }

  return (
    <div>
      <div className="rounded-md border border-status-error/10 bg-status-error/5 p-4">
        {parsed.name && (
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-status-error/60">
            {parsed.name}
          </div>
        )}
        <p className="text-sm leading-relaxed text-status-error">{parsed.message}</p>
        {parsed.stack && (
          <pre className="mt-3 overflow-auto text-xs leading-relaxed text-status-error/50">
            {parsed.stack}
          </pre>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={handleToggleRaw}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Raw
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {copied ? (
            <Check className="h-3 w-3 text-status-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {showRaw && (
        <pre className="mt-2 overflow-auto rounded-md border border-border bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {parsed.raw}
        </pre>
      )}
    </div>
  )
}
