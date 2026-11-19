import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const web = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const exportsMap = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8')).exports as Record<
  string,
  string
>

/** What `@awaitstep/web/<subpath>` maps to, the way Node's `exports` resolution does. */
function target(subpath: string): string | undefined {
  const key = `./${subpath}`
  if (exportsMap[key]) return exportsMap[key]
  for (const [pattern, file] of Object.entries(exportsMap)) {
    const [head, tail] = pattern.split('*')
    if (tail === undefined || !key.startsWith(head!) || !key.endsWith(tail)) continue
    return file.replace('*', key.slice(head!.length, key.length - tail.length))
  }
  return undefined
}

describe('@awaitstep/web exports', () => {
  it('reach every module of the UI kit, .ts and .tsx alike', () => {
    const ui = join(web, 'src/components/ui')
    const modules = readdirSync(ui).filter(
      (file) => /\.tsx?$/.test(file) && !file.includes('.stories.') && !file.includes('.test.'),
    )
    for (const file of modules) {
      const mapped = target(`ui/${file.replace(/\.tsx?$/, '')}`)
      expect(mapped, file).toBeDefined()
      expect(existsSync(join(web, mapped!)), `${file} → ${mapped}`).toBe(true)
    }
  })

  it('reach the extension contract and the page intro', () => {
    for (const subpath of ['extensions', 'shell/page-intro']) {
      expect(existsSync(join(web, target(subpath)!)), subpath).toBe(true)
    }
  })
})
