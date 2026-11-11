import { describe, expect, it } from 'vitest'
import { deployPhases, failedBeforeUpload, phaseOfStage, stoppedAtLine } from '../deploy-phases'

function states(...args: Parameters<typeof deployPhases>) {
  return deployPhases(...args).map((p) => `${p.state}:${p.label}`)
}

describe('deploy phases', () => {
  it('folds the ten build stages into three', () => {
    expect(phaseOfStage('INITIALIZING')).toBe('compile')
    expect(phaseOfStage('BINDINGS_READY')).toBe('compile')
    expect(phaseOfStage('CREATING_WORKER')).toBe('create')
    expect(phaseOfStage('DEPLOYING')).toBe('create')
    expect(phaseOfStage('WORKER_DEPLOYED')).toBe('live')
    expect(phaseOfStage('COMPLETED')).toBe('live')
  })

  it('gives FAILED no place, so the last real stage says where it stopped', () => {
    expect(phaseOfStage('FAILED')).toBeNull()
    expect(phaseOfStage(null)).toBeNull()
  })

  it('shows the phase under way, the ones before it done and the rest not reached', () => {
    expect(states('create', 'deploying')).toEqual([
      'done:Compiled',
      'doing:Creating the worker',
      'idle:Go live',
    ])
  })

  it('marks every phase done once it is live', () => {
    expect(states('create', 'success')).toEqual([
      'done:Compiled',
      'done:Worker created',
      'done:Live',
    ])
  })

  it('marks the phase it failed in, and counts a refusal before any stage as compiling', () => {
    expect(states('create', 'error')).toEqual([
      'done:Compiled',
      'failed:Creating the worker',
      'idle:Go live',
    ])
    expect(states(null, 'error')[0]).toBe('failed:Compiling')
    expect(stoppedAtLine('create')).toBe('Stopped at: creating the worker')
    expect(stoppedAtLine(null)).toBe('Stopped at: compiling')
  })

  it('marks where it lost the stream as unknown, not failed', () => {
    expect(states('create', 'lost')).toEqual([
      'done:Compiled',
      'unknown:Creating the worker',
      'idle:Go live',
    ])
  })

  it('says nothing changed only for a failure before the upload', () => {
    expect(failedBeforeUpload(null)).toBe(true)
    expect(failedBeforeUpload('compile')).toBe(true)
    expect(failedBeforeUpload('create')).toBe(false)
  })
})
