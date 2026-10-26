import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { PEOPLE } from '../../mocks/dashboard/fixtures/people'
import {
  DEFAULT_MOCK_CONTEXT,
  type MockContext,
  type MockScenario,
} from '../../mocks/dashboard/scenario'

export type { MockScenario }

const MOCK_SCENARIOS: readonly MockScenario[] = ['none', 'loading', 'error', 'empty', 'viewer']

const MockContextValue = createContext<MockContext>(DEFAULT_MOCK_CONTEXT)

/**
 * Which forced state (`?mock=`) and which sample person (`?as=`) the dummy
 * hooks run as. N1's root route feeds it from the URL; stories set it from
 * args. Dev-only scaffolding that goes with the mocks.
 */
export function MockScenarioProvider({
  scenario = DEFAULT_MOCK_CONTEXT.scenario,
  userId = DEFAULT_MOCK_CONTEXT.userId,
  children,
}: {
  scenario?: MockScenario
  userId?: string
  children: ReactNode
}) {
  const value = useMemo(() => ({ scenario, userId }), [scenario, userId])
  return <MockContextValue.Provider value={value}>{children}</MockContextValue.Provider>
}

export function useMockContext(): MockContext {
  return useContext(MockContextValue)
}

/** `?mock=loading` → `'loading'`; anything unknown → `'none'`. */
export function parseMockScenario(value: unknown): MockScenario {
  return MOCK_SCENARIOS.find((s) => s === value) ?? 'none'
}

function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * `?as=daniel` → Daniel's id, matched on first name without case or accents
 * (`?as=tomas` is Tomás); anything unknown → the default person.
 */
export function parseMockUser(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_MOCK_CONTEXT.userId
  const wanted = foldName(value)
  const person = PEOPLE.find((p) => foldName(p.name.split(' ')[0]!) === wanted)
  return person?.id ?? DEFAULT_MOCK_CONTEXT.userId
}
