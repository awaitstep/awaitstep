import { datedCsvName, toCsv } from '../../lib/csv'
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
    run.failure
      ? run.failure.step
        ? `${run.failure.step}: ${run.failure.message}`
        : run.failure.message
      : null,
  ])
  return toCsv(HEADER, rows)
}

/** "sales-runs-2026-10-27.csv". */
export function runsCsvName(workspaceSlug: string, now: Date = new Date()): string {
  return datedCsvName(`${workspaceSlug}-runs`, now)
}
