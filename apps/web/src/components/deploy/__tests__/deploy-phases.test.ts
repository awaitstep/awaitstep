import { describe, expect, it } from 'vitest'
import {
  cancellableAt,
  cancelledAtLine,
  deployPhases,
  failedBeforeUpload,
  isPlaceStage,
  phaseOfStage,
  stoppedAtLine,
} from '../deploy-phases'

function states(...args: Parameters<typeof deployPhases>) {
  return deployPhases(...args).map((p) => `${p.state}:${p.label}`)
}

describe('deploy phases', () => {
  it('folds the build stages into three, the worker created only from the upload on', () => {
    expect(phaseOfStage('INITIALIZING')).toBe('compile')
    expect(phaseOfStage('BINDINGS_READY')).toBe('compile')
    // Installing and checking the build happen before anything reaches the provider.
    expect(phaseOfStage('CREATING_WORKER')).toBe('compile')
    expect(phaseOfStage('DEPLOYING')).toBe('compile')
    expect(phaseOfStage('UPLOADING')).toBe('create')
    expect(phaseOfStage('WORKER_DEPLOYED')).toBe('live')
    expect(phaseOfStage('COMPLETED')).toBe('live')
  })

  it('gives FAILED and CANCELLED no place, so the last real stage says where it stopped', () => {
    expect(phaseOfStage('FAILED')).toBeNull()
    expect(phaseOfStage('CANCELLED')).toBeNull()
    expect(phaseOfStage(null)).toBeNull()
    expect(isPlaceStage('CANCELLED')).toBe(false)
    expect(isPlaceStage('UPLOADING')).toBe(true)
  })

  it('marks where a cancel stopped it, and the rest not reached', () => {
    expect(states('compile', 'cancelled')).toEqual([
      'stopped:Compile',
      'idle:Create the worker',
      'idle:Go live',
    ])
    expect(cancelledAtLine('compile')).toBe('Stopped while compiling')
    expect(cancelledAtLine(null)).toBe('Stopped while compiling')
  })

  it('can be cancelled only until the upload starts', () => {
    expect(cancellableAt(null)).toBe(true)
    expect(cancellableAt('compile')).toBe(true)
    expect(cancellableAt('create')).toBe(false)
    expect(cancellableAt('live')).toBe(false)
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
