import { describe, expect, it } from 'vitest'
import type { TestSession } from '../api-client'
import {
  UP_TO_DATE,
  describeSavedChanges,
  describeUnsaved,
  isBehind,
  sessionStaleness,
} from '../ide/session-staleness'

function session(files: TestSession['files'], versionId = 'v1'): TestSession {
  return {
    id: 's1',
    workflowId: 'wf',
    versionId,
    runtime: 'sandbox',
    status: 'running',
    error: null,
    createdAt: '2026-11-05T14:02:00.000Z',
    lastUsedAt: '2026-11-05T14:02:00.000Z',
    files,
  }
}

const at = (s: TestSession | null, current: Record<string, string>, unsaved = 0, version = 'v1') =>
  sessionStaleness({
    session: s,
    versionId: version,
    currentHashes: current,
    unsavedCount: unsaved,
  })

describe('sessionStaleness', () => {
  it('is up to date with no session', () => {
    expect(at(null, { 'a.ts': 'h' })).toBe(UP_TO_DATE)
  })

  it('is up to date when the manifest matches the project', () => {
    const result = at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h1' })
    expect(isBehind(result)).toBe(false)
  })

  it('counts a file saved after the session started', () => {
    const result = at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h2' })
    expect(result).toMatchObject({ saved: 1, deleted: 0, added: 0 })
    expect(isBehind(result)).toBe(true)
  })

  it('counts a deleted file, which a timestamp check would miss', () => {
    const result = at(session({ 'a.ts': 'h1', 'b.ts': 'h2' }), { 'a.ts': 'h1' })
    expect(result).toMatchObject({ saved: 0, deleted: 1 })
    expect(isBehind(result)).toBe(true)
  })

  it('counts saved and deleted together', () => {
    const result = at(session({ 'a.ts': 'h1', 'b.ts': 'h2' }), { 'a.ts': 'h9' })
    expect(describeSavedChanges(result, '2026-11-05T14:02:00.000Z')).toMatch(
      /^1 file saved and 1 deleted since this session started at /,
    )
  })

  it('cannot say what changed for a session without a manifest', () => {
    const result = at(session(null), { 'a.ts': 'h1' })
    expect(isBehind(result)).toBe(false)
  })

  it('treats an older version as behind even when the files match', () => {
    const result = at(session({ 'a.ts': 'h1' }, 'v1'), { 'a.ts': 'h1' }, 0, 'v2')
    expect(result.version).toBe(true)
    expect(isBehind(result)).toBe(true)
  })

  it('keeps unsaved files out of the behind verdict and the signature', () => {
    const base = at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h2' }, 0)
    const typing = at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h2' }, 3)
    expect(typing.signature).toBe(base.signature)
    expect(isBehind(at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h1' }, 2))).toBe(false)
  })

  it('changes its signature on the next save, so "Trigger anyway" asks again', () => {
    const first = at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h2' })
    const second = at(session({ 'a.ts': 'h1' }), { 'a.ts': 'h3' })
    expect(second.signature).not.toBe(first.signature)
  })
})

describe('wording', () => {
  it('says nothing when nothing was saved or is unsaved', () => {
    expect(describeSavedChanges(UP_TO_DATE, '2026-11-05T14:02:00.000Z')).toBeNull()
    expect(describeUnsaved(UP_TO_DATE)).toBeNull()
  })

  it('pluralises unsaved files', () => {
    expect(describeUnsaved({ ...UP_TO_DATE, unsaved: 1 })).toBe(
      '1 unsaved file isn’t in this session.',
    )
    expect(describeUnsaved({ ...UP_TO_DATE, unsaved: 2 })).toBe(
      '2 unsaved files aren’t in this session.',
    )
  })

  it('names only a delete when only a delete happened', () => {
    const text = describeSavedChanges({ ...UP_TO_DATE, deleted: 2 }, '2026-11-05T14:02:00.000Z')
    expect(text).toMatch(/^2 files deleted since this session started at /)
  })
})

describe('review regressions', () => {
  it('gives a version-only staleness its own signature, so a later version asks again', () => {
    const v2 = at(session({ 'a.ts': 'h1' }, 'v1'), { 'a.ts': 'h1' }, 0, 'v2')
    const v3 = at(session({ 'a.ts': 'h1' }, 'v1'), { 'a.ts': 'h1' }, 0, 'v3')
    expect(v2.signature).not.toBe('')
    expect(v3.signature).not.toBe(v2.signature)
  })

  it('compares files only when the editor shows the live project', () => {
    const result = sessionStaleness({
      session: session({ 'a.ts': 'h1' }),
      versionId: 'v1',
      currentHashes: null,
      unsavedCount: 0,
    })
    expect(isBehind(result)).toBe(false)
  })
})
