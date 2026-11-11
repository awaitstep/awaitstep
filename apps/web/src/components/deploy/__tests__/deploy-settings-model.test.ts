import { describe, expect, it } from 'vitest'
import {
  cloudflareDefaultDeploymentConfig,
  cloudflareDeploymentConfigUiSchema as schema,
} from '@awaitstep/provider-cloudflare'
import {
  buildHints,
  groupChanged,
  groupSummary,
  resetToDefaults,
  settingChanges,
  withoutBlankItems,
} from '../deploy-settings-model'

// The real Cloudflare schema and defaults: the summaries are only as good as
// the labels the provider gives them.

const objects = buildHints(schema)
const defaults = { ...cloudflareDefaultDeploymentConfig } as Record<string, unknown>
const group = (title: string) => schema.groups.find((g) => g.title === title)!

describe('deploy settings', () => {
  it('summarises a group in one line from its values', () => {
    expect(groupSummary(group('Preview & access'), defaults, objects)).toBe(
      'workers.dev on · Preview URLs on',
    )
    expect(
      groupSummary(group('Scheduling'), { ...defaults, cronTriggers: ['0 */6 * * *'] }, objects),
    ).toBe('Cron 0 */6 * * *')
    expect(groupSummary(group('Scheduling'), defaults, objects)).toBe('Defaults')
    expect(groupSummary(group('Instance retention'), defaults, objects)).toBe(
      'Success 7 days · Failure 7 days',
    )
  })

  it('reads a saved object behind a switch as on, and shows sub-settings only when on', () => {
    expect(
      groupSummary(
        group('Performance'),
        { placement: { mode: 'smart' }, limits: { cpuMs: 50 } },
        objects,
      ),
    ).toBe('Smart Placement on · CPU ms 50')
    expect(groupSummary(group('Observability'), {}, objects)).toBe('Observability off')
    // The provider's default is what an unset config deploys: logs and traces on.
    expect(groupSummary(group('Observability'), defaults, objects)).toBe(
      'Observability on · Logs on · Sampling 1',
    )
    // Off is stored in its object form, and reads back as off.
    expect(
      groupSummary(
        group('Observability'),
        { observability: { enabled: false, logs: { enabled: false }, traces: { enabled: false } } },
        objects,
      ),
    ).toBe('Observability off')
    expect(groupSummary(group('Observability'), { observability: true }, objects)).toBe(
      'Observability on · Logs on · Sampling 1',
    )
  })

  it('tags a group Changed only when a value differs from the provider’s defaults', () => {
    expect(groupChanged(group('Preview & access'), defaults, defaults, objects)).toBe(false)
    expect(
      groupChanged(
        group('Preview & access'),
        { ...defaults, previewUrls: false },
        defaults,
        objects,
      ),
    ).toBe(true)
    // An emptied list is the same as none.
    expect(
      groupChanged(group('Scheduling'), { ...defaults, cronTriggers: [] }, defaults, objects),
    ).toBe(false)
  })

  it('lists what differs from the deployed settings, with the old value', () => {
    const deployed = { ...defaults }
    const now = { ...defaults, cronTriggers: ['0 */6 * * *'], workersDev: false }
    expect(settingChanges(schema, now, deployed, objects)).toEqual([
      { what: 'workers.dev', now: 'off', before: 'on' },
      { what: 'Cron', now: '0 */6 * * *', before: 'none' },
    ])
    expect(settingChanges(schema, deployed, deployed, objects)).toEqual([])
  })

  it('counts a switch’s sub-settings as the switch’s one change, not one line each', () => {
    const off = { ...defaults, observability: false }
    expect(settingChanges(schema, off, defaults, objects)).toEqual([
      { what: 'Observability', now: 'off', before: 'on' },
    ])
    expect(groupChanged(group('Observability'), off, defaults, objects)).toBe(true)
  })

  it('drops list items left blank, so they neither fail the deploy nor read as a change', () => {
    const edited = {
      ...defaults,
      customDomains: ['', ' '],
      routes: [{ pattern: '', zoneName: '' }],
      cronTriggers: ['0 * * * *', ''],
    }
    expect(
      settingChanges(schema, edited, { ...defaults, cronTriggers: ['0 * * * *'] }, objects),
    ).toEqual([])
    const sent = withoutBlankItems(schema, edited, objects)
    expect(sent).not.toHaveProperty('customDomains', expect.anything())
    expect(sent.routes).toBeUndefined()
    expect(sent.cronTriggers).toEqual(['0 * * * *'])
  })

  it('resets every shown setting and keeps the bindings', () => {
    const edited = {
      workersDev: false,
      cronTriggers: ['* * * * *'],
      limits: { cpuMs: 9 },
      bindings: { KV: { kind: 'kv', resourceId: 'ns' } },
    }
    const reset = resetToDefaults(schema, edited, defaults)
    expect(reset).toEqual({ ...defaults, bindings: edited.bindings })
    for (const g of schema.groups) expect(groupChanged(g, reset, defaults, objects)).toBe(false)
  })
})
