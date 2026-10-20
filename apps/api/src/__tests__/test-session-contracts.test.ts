import { describe, it, expect } from 'vitest'
import type { TestSession } from '@awaitstep/db'
import { TEST_SESSION_RUNTIMES, type TestSessionRuntime } from '@awaitstep/codegen'

/**
 * `@awaitstep/db` is standalone — it cannot import the runner contract, and
 * the contract cannot depend on the database — so the runtime enum is written
 * out in both. This file is the seam that notices when they drift: it is the
 * only package that depends on both, and these assertions fail to compile if
 * either side gains or loses a value.
 */
type StoredRuntime = TestSession['runtime']

type ContractCoversStored = StoredRuntime extends TestSessionRuntime ? true : never
type StoredCoversContract = TestSessionRuntime extends StoredRuntime ? true : never

const aligned: ContractCoversStored & StoredCoversContract = true

describe('test session runtime enum', () => {
  it('is the same set on both sides of the seam', () => {
    expect(aligned).toBe(true)
    // A value-level copy of the same guard, so the list itself is pinned.
    const stored: StoredRuntime[] = ['sandbox', 'node']
    expect([...TEST_SESSION_RUNTIMES].sort()).toEqual([...stored].sort())
  })
})
