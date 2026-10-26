import type { RunRow } from '../db'
import { minutesAgo } from './clock'
import { CRM_SYNC, LEAD, PRICING, PROVISION, QUOTE, SLACK, TRIAGE } from './items'

// Runs that reproduce the boards: WsRuns' first eight rows (of 128 in the
// last 24 hours), Lead enrichment's bars ppppfpppff and Inbound webhook
// triage's ppppppfppp (oldest first), "Failing now" = 1, IT "All passing ·
// 1h ago", Marketing Site 3h ago, Internal Tools 20m ago.

type RunSeed = Partial<RunRow> & Pick<RunRow, 'id' | 'itemId'> & { minutes: number }

const FETCH_FAILED = {
  step: 'Fetch company',
  message: 'The CRM returned 429 Too Many Requests',
}

const SALES_TOTAL_24H = 128

function triggerOf(itemId: string): RunRow['trigger'] {
  if (itemId === CRM_SYNC || itemId === PRICING || itemId === SLACK) return 'http'
  if (itemId === QUOTE || itemId.startsWith('itm_int_')) return 'schedule'
  return 'webhook'
}

function isFunction(itemId: string): boolean {
  return triggerOf(itemId) === 'http'
}

function run(now: Date, seed: RunSeed): RunRow {
  const fn = isFunction(seed.itemId)
  const { minutes, ...rest } = seed
  return {
    result: 'succeeded',
    trigger: triggerOf(seed.itemId),
    startedAt: minutesAgo(now, minutes),
    durationMs: fn ? 80 : 2400,
    waitingOn: null,
    httpStatus: fn ? 200 : null,
    failure: null,
    ...rest,
  }
}

// Board rows, newest first.
const SALES_HEAD: RunSeed[] = [
  {
    id: 'run_8f2c',
    itemId: LEAD,
    minutes: 5,
    result: 'failed',
    durationMs: 4200,
    failure: FETCH_FAILED,
  },
  {
    id: 'run_8f2a',
    itemId: QUOTE,
    minutes: 12,
    result: 'running',
    durationMs: null,
    waitingOn: 'Wait 3 days',
  },
  { id: 'run_8f27', itemId: QUOTE, minutes: 22, durationMs: 1100 },
  { id: 'req_31c9', itemId: CRM_SYNC, minutes: 31, durationMs: 86 },
  {
    id: 'run_8f11',
    itemId: LEAD,
    minutes: 48,
    result: 'failed',
    durationMs: 3900,
    failure: FETCH_FAILED,
  },
  { id: 'run_8f03', itemId: TRIAGE, minutes: 58, durationMs: 2700 },
  { id: 'run_8ef9', itemId: LEAD, minutes: 64, durationMs: 3100 },
  { id: 'req_30a2', itemId: PRICING, minutes: 120, durationMs: 41 },
]

// The rest of the two bar patterns, older than the board rows.
const SALES_PATTERNS: RunSeed[] = [
  ...[130, 140, 150, 160, 170, 180, 190].map((minutes, i) => ({
    id: `run_lead_${i}`,
    itemId: LEAD,
    minutes,
    ...(minutes === 150 ? { result: 'failed' as const, failure: FETCH_FAILED } : {}),
  })),
  ...[135, 145, 155, 165, 175, 185, 195, 205, 215].map((minutes, i) => ({
    id: `run_triage_${i}`,
    itemId: TRIAGE,
    minutes,
    ...(minutes === 155
      ? { result: 'failed' as const, failure: { step: 'Pick owner', message: 'No owner matched' } }
      : {}),
  })),
]

const SALES_FILLER_CYCLE = [LEAD, CRM_SYNC, QUOTE, TRIAGE, CRM_SYNC, PRICING, LEAD, CRM_SYNC]

/** Steady successful runs, `count` of them from `first` minutes ago, `every` minutes apart. */
function steady(
  now: Date,
  prefix: string,
  itemIds: string[],
  count: number,
  first: number,
  every: number,
) {
  return Array.from({ length: count }, (_, i) =>
    run(now, {
      id: `${prefix}_${i}`,
      itemId: itemIds[i % itemIds.length]!,
      minutes: first + i * every,
    }),
  )
}

export function seedRuns(now: Date): RunRow[] {
  const head = [...SALES_HEAD, ...SALES_PATTERNS].map((seed) => run(now, seed))
  const fillerCount = SALES_TOTAL_24H - head.length
  // Spread over the rest of the last 24 hours, after the pattern runs.
  const salesFiller = Array.from({ length: fillerCount }, (_, i) =>
    run(now, {
      id: `run_sales_${i}`,
      itemId: SALES_FILLER_CYCLE[i % SALES_FILLER_CYCLE.length]!,
      minutes: 220 + Math.floor((i * (1430 - 220)) / fillerCount),
    }),
  )
  const internal = Array.from({ length: 7 }, (_, i) => `itm_int_${i}`)
  const marketing = Array.from({ length: 4 }, (_, i) => `itm_mkt_${i}`)
  return [
    ...head,
    ...salesFiller,
    // Older than 24 hours, so the 7- and 30-day periods hold more.
    ...steady(now, 'run_sales_old', [LEAD, QUOTE, TRIAGE, CRM_SYNC], 40, 1500, 240),
    ...steady(now, 'run_it', [PROVISION, 'itm_offboard', 'itm_laptop', SLACK], 30, 60, 45),
    ...steady(now, 'run_mkt', marketing, 12, 180, 120),
    ...steady(now, 'run_int', internal, 21, 20, 60),
  ]
}
