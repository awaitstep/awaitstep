import { describe, it, expect } from 'vitest'
import { buildDefaults, isVisible, readPath, writePath, type DefaultsByPath } from '../config-paths'

const OBSERVABILITY_DEFAULT_OBJECT = {
  enabled: false,
  head_sampling_rate: 1,
  logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true },
  traces: { enabled: true, persist: true, head_sampling_rate: 1 },
}

const SCHEMA = {
  groups: [
    {
      fields: [
        {
          path: 'observability',
          defaultObject: OBSERVABILITY_DEFAULT_OBJECT,
        },
        {
          path: 'observability.logs.persist',
          visibleWhen: { path: 'observability', truthy: true as const },
        },
        {
          path: 'logpush',
        },
      ],
    },
  ],
}

const DEFAULTS: DefaultsByPath = buildDefaults(SCHEMA)

describe('buildDefaults', () => {
  it('collects defaultObject hints keyed by field path', () => {
    expect(DEFAULTS.get('observability')).toBe(OBSERVABILITY_DEFAULT_OBJECT)
    expect(DEFAULTS.get('logpush')).toBeUndefined()
  })
})

describe('readPath', () => {
  it('reads top-level values', () => {
    expect(readPath({ workersDev: true }, 'workersDev', DEFAULTS)).toBe(true)
  })

  it('reads nested object values', () => {
    expect(
      readPath(
        { observability: { logs: { persist: false } } },
        'observability.logs.persist',
        DEFAULTS,
      ),
    ).toBe(false)
  })

  it('expands boolean-true parents via defaults so sub-fields show canonical defaults', () => {
    expect(readPath({ observability: true }, 'observability.logs.persist', DEFAULTS)).toBe(true)
    expect(readPath({ observability: true }, 'observability.head_sampling_rate', DEFAULTS)).toBe(1)
  })

  it('returns undefined when parent is false', () => {
    expect(
      readPath({ observability: false }, 'observability.logs.persist', DEFAULTS),
    ).toBeUndefined()
  })

  it('returns undefined when path is missing entirely', () => {
    expect(readPath({}, 'observability.logs.persist', DEFAULTS)).toBeUndefined()
  })

  it('returns undefined for boolean intermediates lacking a defaults entry', () => {
    expect(readPath({ unknown: true }, 'unknown.deeper', DEFAULTS)).toBeUndefined()
  })
})

describe('writePath', () => {
  it('writes a top-level scalar without mutating input', () => {
    const input = { workersDev: true }
    const out = writePath(input, 'workersDev', false, DEFAULTS)
    expect(out).toEqual({ workersDev: false })
    expect(input.workersDev).toBe(true)
  })

  it('materializes a boolean-true parent before writing a sub-field, preserving sibling defaults', () => {
    const out = writePath({ observability: true }, 'observability.logs.persist', false, DEFAULTS)
    expect(out).toEqual({
      observability: {
        enabled: false,
        head_sampling_rate: 1,
        logs: { enabled: true, head_sampling_rate: 1, persist: false, invocation_logs: true },
        traces: { enabled: true, persist: true, head_sampling_rate: 1 },
      },
    })
  })

  it('merges into an existing object parent without clobbering siblings', () => {
    const out = writePath(
      { observability: { logs: { enabled: true, persist: true } } },
      'observability.logs.persist',
      false,
      DEFAULTS,
    )
    expect(out).toEqual({
      observability: { logs: { enabled: true, persist: false } },
    })
  })

  it('writes through a deep path starting from an empty config', () => {
    const out = writePath({}, 'observability.logs.persist', false, DEFAULTS)
    expect(out).toEqual({ observability: { logs: { persist: false } } })
  })

  it('does not share references with the input for the modified branch', () => {
    const original = { observability: { logs: { persist: true } } }
    const out = writePath(original, 'observability.logs.persist', false, DEFAULTS) as {
      observability: { logs: { persist: boolean } }
    }
    expect(out.observability).not.toBe(original.observability)
    expect(out.observability.logs).not.toBe(original.observability.logs)
    expect(original.observability.logs.persist).toBe(true)
  })
})

describe('isVisible', () => {
  const field = {
    path: 'observability.logs.persist',
    visibleWhen: { path: 'observability', truthy: true as const },
  }

  it('shows fields with no predicate', () => {
    expect(isVisible({ path: 'logpush' }, {}, DEFAULTS)).toBe(true)
  })

  it('shows when the gated path is boolean true', () => {
    expect(isVisible(field, { observability: true }, DEFAULTS)).toBe(true)
  })

  it('shows when the gated path is a non-empty object', () => {
    expect(isVisible(field, { observability: { logs: { persist: false } } }, DEFAULTS)).toBe(true)
  })

  it('hides when the gated path is boolean false', () => {
    expect(isVisible(field, { observability: false }, DEFAULTS)).toBe(false)
  })

  it('hides when the gated path is undefined', () => {
    expect(isVisible(field, {}, DEFAULTS)).toBe(false)
  })
})
