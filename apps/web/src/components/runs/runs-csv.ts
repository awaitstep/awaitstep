import type { WorkspaceRun } from '../../types/dashboard/runs'
import { ITEM_KIND_LABEL } from '../items/item-kind'
import { resultLabel, triggerLabel } from './run-format'

const HEADER = [
  'Result',
  'Workflow',
  'Kind',
  'Run ID',
  'Trigger',
  'Started',
  'Took (ms)',
  'Failed at',
]

// A cell a spreadsheet would run as a formula (OWASP "CSV injection").
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string | number | null): string {
  if (typeof value === 'number') return String(value)
  const raw = value ?? ''
  // Names and failure messages are user text: a leading ' keeps them text.
  const text = FORMULA_START.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Runs → Export: one row per run, newest first, times as ISO. */
export function runsToCsv(runs: WorkspaceRun[]): string {
  const rows = runs.map((run) => [
    resultLabel(run),
    run.workflowName,
    ITEM_KIND_LABEL[run.kind],
    run.id,
    triggerLabel(run.trigger),
    run.createdAt,
    run.durationMs,
    run.failure ? `${run.failure.step}: ${run.failure.message}` : null,
  ])
  return [HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n'
}

/** "sales-runs-2026-10-27.csv". */
export function runsCsvName(workspaceSlug: string, now: Date = new Date()): string {
  return `${workspaceSlug}-runs-${now.toISOString().slice(0, 10)}.csv`
}
