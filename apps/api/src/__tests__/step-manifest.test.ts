import { describe, expect, it } from 'vitest'
import type { StepManifest } from '@awaitstep/codegen'
import { coalescedMembers } from '../lib/step-manifest.js'

describe('coalescedMembers', () => {
  it('keeps members whose node id is a prototype property name', () => {
    const manifest = {
      steps: [
        { nodeId: '__proto__', coalescedInto: 'leader' },
        { nodeId: 'constructor', coalescedInto: 'leader' },
      ],
    } as unknown as StepManifest
    const links = coalescedMembers(manifest)
    expect(Object.keys(links).sort()).toEqual(['__proto__', 'constructor'])
    expect(JSON.parse(JSON.stringify(links))).toEqual(
      JSON.parse('{"__proto__":"leader","constructor":"leader"}'),
    )
  })
})
