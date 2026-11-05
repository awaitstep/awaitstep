import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('browser bundle', () => {
  it('never imports the provider package root, which pulls Node-only deploy code (fs/promises)', () => {
    const root = join(__dirname, '..', '..')
    const offenders = sourceFiles(root).filter((file) =>
      /from '@awaitstep\/provider-cloudflare'/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
