import { describe, expect, it } from 'vitest'
import type { WorkspaceRun } from '../../../types/dashboard/runs'
import { runsCsvName, runsToCsv } from '../runs-csv'

const RUN: WorkspaceRun = {
  id: 'run_8f2c',
  workflowId: 'itm_lead',
  createdAt: '2026-10-27T11:55:00.000Z',
  workflowName: 'Lead enrichment',
  kind: 'workflow',
  result: 'failed',
  trigger: 'webhook',
  durationMs: 4200,
  waitingOn: null,
  httpStatus: null,
  failure: { step: 'Fetch company', message: 'CRM returned 429' },
}

describe('runs CSV', () => {
  it('writes a header and one row per run', () => {
    expect(runsToCsv([RUN]).split('\n')).toEqual([
      'Result,Workflow,Kind,Run ID,Trigger,Started,Took (ms),Failed at',
      'Failed,Lead enrichment,Workflow,run_8f2c,Webhook,2026-10-27T11:55:00.000Z,4200,Fetch company: CRM returned 429',
      '',
    ])
  })

  it('quotes cells with commas or quotes, and leaves a running run’s time empty', () => {
    const csv = runsToCsv([
      {
        ...RUN,
        workflowName: 'Say "hi", then wait',
        result: 'running',
        durationMs: null,
        failure: null,
      },
    ])
    expect(csv.split('\n')[1]).toBe(
      'Running,"Say ""hi"", then wait",Workflow,run_8f2c,Webhook,2026-10-27T11:55:00.000Z,,',
    )
  })

  it('keeps user text that looks like a formula from running in a spreadsheet', () => {
    const csv = runsToCsv([
      {
        ...RUN,
        workflowName: '=HYPERLINK("https://evil","click")',
        failure: { step: '@step', message: '-1' },
      },
    ])
    expect(csv.split('\n')[1]).toBe(
      'Failed,"\'=HYPERLINK(""https://evil"",""click"")",Workflow,run_8f2c,Webhook,2026-10-27T11:55:00.000Z,4200,\'@step: -1',
    )
  })

  it('quotes a lone carriage return so it can’t split the row', () => {
    const csv = runsToCsv([{ ...RUN, workflowName: 'a\rb' }])
    expect(csv.split('\n')[1]).toContain('"a\rb"')
  })

  it('names the file after the workspace and the day', () => {
    expect(runsCsvName('sales', new Date('2026-10-27T12:00:00Z'))).toBe('sales-runs-2026-10-27.csv')
  })
})
