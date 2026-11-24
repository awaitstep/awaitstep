// Runs only the tests a change reaches: for each workspace package with changed files, vitest
// runs the test files that import them (`vitest related`) plus any changed test files. The db
// package is left out (its suite runs on pull requests, in CI) unless `--with-db` is passed.
// Packages that only depend on a changed package are not re-run here: type-check covers their
// use of its API, and the full suite runs in CI on every pull request.
//
//   pnpm test:affected                 changes since the branch point, committed or not
//   pnpm test:affected --base <ref>    changes since <ref>
//   pnpm test:affected --with-db       include packages/db
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = /\.(ts|tsx|mts|js|mjs|jsx|json|astro)$/
const DB_DIR = 'packages/db'
const FALLBACK_BASES = ['origin/feat/awaitstep-v2', 'origin/dev']

/** Groups changed repo paths by the workspace package that holds them, keeping source files only. */
export function groupByPackage(files, packageDirs, { withDb = false } = {}) {
  const dirs = [...packageDirs].sort((a, b) => b.length - a.length)
  const groups = new Map()
  for (const file of files) {
    if (!SOURCE.test(file)) continue
    const dir = dirs.find((d) => file.startsWith(`${d}/`))
    if (!dir || (dir === DB_DIR && !withDb)) continue
    const list = groups.get(dir) ?? []
    list.push(relative(dir, file))
    groups.set(dir, list)
  }
  return groups
}

export function parseArgs(argv) {
  const args = { base: undefined, withDb: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--with-db') args.withDb = true
    else if (argv[i] === '--base') args.base = argv[++i]
  }
  return args
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function tryGit(...args) {
  try {
    return git(...args)
  } catch {
    return undefined
  }
}

function branchPoint(base) {
  if (base) return git('merge-base', 'HEAD', base)
  const upstream = tryGit('rev-parse', '--abbrev-ref', '@{upstream}')
  for (const ref of [upstream, ...FALLBACK_BASES]) {
    const point = ref && tryGit('merge-base', 'HEAD', ref)
    if (point) return point
  }
  return 'HEAD'
}

function changedFiles(base) {
  const tracked = git('diff', '--name-only', branchPoint(base)).split('\n')
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n')
  return [...new Set([...tracked, ...untracked])].filter((f) => f && existsSync(join(ROOT, f)))
}

function testablePackageDirs() {
  const dirs = []
  for (const line of git('ls-files', '*/package.json', '*/*/package.json').split('\n')) {
    const dir = dirname(line)
    if (dir.includes('node_modules')) continue
    const pkg = JSON.parse(readFileSync(join(ROOT, line), 'utf8'))
    if (pkg.scripts?.test?.includes('vitest')) dirs.push(dir)
  }
  return dirs
}

function main(argv) {
  const { base, withDb } = parseArgs(argv)
  const groups = groupByPackage(changedFiles(base), testablePackageDirs(), { withDb })
  if (groups.size === 0) {
    process.stdout.write('test:affected: no changed source files in a tested package\n')
    return
  }
  let failed = false
  for (const [dir, files] of groups) {
    process.stdout.write(`\ntest:affected: ${dir} (${files.length} changed)\n`)
    const run = spawnSync(
      'pnpm',
      ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...files],
      { cwd: join(ROOT, dir), stdio: 'inherit' },
    )
    if (run.status !== 0) failed = true
  }
  if (failed) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
