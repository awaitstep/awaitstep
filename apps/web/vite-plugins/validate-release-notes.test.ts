import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateReleaseNotes } from './validate-release-notes'

const VALID = `---
tag: new
date: 2026-11-02T09:00:00.000Z
title: A note
link: projects
linkLabel: See your projects
---
What changed.
`

function runBuildStart(dir: string): string | null {
  const plugin = validateReleaseNotes(dir)
  const hook = plugin.buildStart as (this: { error(message: string): never }) => void
  try {
    hook.call({
      error(message) {
        throw new Error(message)
      },
    })
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe('validateReleaseNotes', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'release-notes-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lets a build with valid fragments through', () => {
    writeFileSync(join(dir, 'a.md'), VALID)
    expect(runBuildStart(dir)).toBeNull()
  })

  it('fails the build on a bad fragment, naming the file', () => {
    writeFileSync(join(dir, 'a.md'), VALID)
    writeFileSync(join(dir, 'bad.md'), VALID.replace('tag: new', 'tag: shiny'))
    expect(runBuildStart(dir)).toMatch(/release-notes\/bad\.md: unknown tag "shiny"/)
  })

  it('checks fragments beyond the newest 20 and ignores non-markdown files', () => {
    for (let i = 0; i < 21; i++) writeFileSync(join(dir, `n${i}.md`), VALID)
    writeFileSync(join(dir, '_template.md.example'), 'not a fragment')
    expect(runBuildStart(dir)).toBeNull()
    writeFileSync(join(dir, 'n0.md'), VALID.replace('link: projects', 'link: nowhere'))
    expect(runBuildStart(dir)).toMatch(/n0\.md: unknown page "nowhere"/)
  })

  it('only runs on build, so a typo does not break pnpm dev', () => {
    expect(validateReleaseNotes(dir).apply).toBe('build')
  })
})
