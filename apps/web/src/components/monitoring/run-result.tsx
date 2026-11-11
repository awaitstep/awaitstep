import type { RunSummary } from '../../lib/api-client'
import { RunCard } from './parts/run-card'
import { RunErrorBlock } from './run-error-block'

interface RunResultProps {
  run: RunSummary
  /** A failed step already shows why it stopped. */
  explained: boolean
}

/**
 * What the run as a whole returned, or why it ended when no step says so
 * (its records went, its account went).
 */
export function RunResult({ run, explained }: RunResultProps) {
  if (run.error && !explained) {
    return (
      <RunCard title="Why it stopped">
        <div className="px-4 py-3.5">
          <RunErrorBlock error={run.error} />
        </div>
      </RunCard>
    )
  }
  if (run.status !== 'complete' || !run.output) return null
  return (
    <RunCard title="Run output">
      <pre className="max-h-[240px] overflow-auto px-4 py-3.5 font-mono text-[11.5px] leading-relaxed text-foreground/80">
        {prettyJson(run.output)}
      </pre>
    </RunCard>
  )
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
