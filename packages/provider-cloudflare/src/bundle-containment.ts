import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { GenerateInputError } from '@awaitstep/codegen'
import { redactSensitive } from './deploy/deployer.js'
import { wranglerCommand, wranglerEnv, wranglerFailureReason } from './wrangler-exec.js'

const execFileAsync = promisify(execFile)

const DRY_RUN_TIMEOUT_MS = 120_000

// Inputs wrangler itself injects — its virtual polyfill entries and the
// unenv runtime it aliases Node built-ins to — live in its own install, not
// the project. Matched by package directory, not by a fixed location: the
// install is a pnpm store, a flat node_modules or an npx cache depending on
// how the API was built.
const WRANGLER_RUNTIME_PACKAGES = [
  `${sep}node_modules${sep}wrangler${sep}`,
  `${sep}node_modules${sep}unenv${sep}`,
  `${sep}node_modules${sep}@cloudflare${sep}unenv-preset${sep}`,
]

// What wrangler's module collector names a non-JS module it copies into the
// output: the sha1 of the file's content, then its basename.
const COLLECTED_MODULE = /^([0-9a-f]{40})-(.+)$/

/**
 * The workflow's own imports reach outside it — a finding about the input,
 * so callers answer it as one (a 4xx, a diagnostic), not as a server fault.
 */
export class BundleEscapeError extends GenerateInputError {
  constructor(readonly escapes: readonly string[]) {
    super(
      `The bundle reaches outside the project: ${escapes.join('; ')}. Imports must stay inside it.`,
      'import',
    )
    this.name = 'BundleEscapeError'
  }
}

interface Metafile {
  inputs: Record<string, unknown>
  outputs: Record<string, { entryPoint?: string }>
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function wranglerRuntimeFile(path: string): boolean {
  return WRANGLER_RUNTIME_PACKAGES.some((segment) => path.includes(segment))
}

function sha1(content: Buffer): string {
  return createHash('sha1').update(content).digest('hex')
}

// Regular files under `root` by basename. Symlinks are not followed: a link
// inside the project pointing at a host file must not vouch for that file.
async function filesByBasename(root: string): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>()
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile()) {
        found.set(entry.name, [...(found.get(entry.name) ?? []), path])
      }
    }
  }
  await walk(root)
  return found
}

/**
 * Builds the Worker wrangler would deploy from `dir` into `outdir`, and proves
 * the build reads nothing outside `dir`. Returns the bundled entry's absolute
 * path: deploying that file with `--no-bundle` uploads exactly what was
 * checked, rather than a second build that merely should match.
 *
 * Wrangler's bundler follows any path on the filesystem it runs on, so an
 * import that climbs out of the directory, a bare package found in a parent
 * `node_modules`, a symlink, a glob import or a dependency's `browser` remap
 * can each pack a file from the build host into the Worker. Rather than
 * imitate wrangler's resolver — every imitation drifts — this asks wrangler
 * for the build (`deploy --dry-run --outdir --metafile`) and checks what it
 * actually read:
 *
 * - every metafile input, after realpath, is inside `dir` or inside the
 *   wrangler runtime it injects itself;
 * - every module the collector copied (`.txt`, `.wasm`, `.html` …), which the
 *   metafile only names by hash, matches the content of a real file inside
 *   `dir` — however the collector resolved it.
 *
 * Fails closed: a build that cannot be produced or read is not deployed.
 * `outdir` must be outside `dir`, empty, and the caller's to remove.
 */
export async function buildContainedBundle(dir: string, outdir: string): Promise<string> {
  const root = await realpath(dir)
  const metaDir = await mkdtemp(join(tmpdir(), 'awaitstep-metafile-'))
  try {
    // Beside the output, not in it: everything in the output directory is
    // uploaded as a module by a `--no-bundle` deploy.
    const metafilePath = join(metaDir, 'meta.json')
    const wrangler = wranglerCommand()
    try {
      await execFileAsync(
        wrangler.command,
        [...wrangler.args, 'deploy', '--dry-run', '--outdir', outdir, '--metafile', metafilePath],
        { cwd: root, env: wranglerEnv(), timeout: DRY_RUN_TIMEOUT_MS },
      )
    } catch (err) {
      const { stderr = '', stdout = '' } = err as { stderr?: string; stdout?: string }
      const detail = redactSensitive(wranglerFailureReason(`${stdout}\n${stderr}`))
      throw new Error(
        `Could not check that the bundle stays inside the project${detail ? `: ${detail}` : ''}`,
        { cause: err },
      )
    }

    const metafile = JSON.parse(await readFile(metafilePath, 'utf-8')) as Metafile
    const escapes: string[] = []

    for (const key of Object.keys(metafile.inputs)) {
      const absolute = resolve(root, key)
      const real = await realpath(absolute).catch(() => absolute)
      if (inside(root, real) || wranglerRuntimeFile(real)) continue
      escapes.push(`"${relative(root, real)}"`)
    }

    const collected = (await readdir(outdir)).filter((name) => COLLECTED_MODULE.test(name))
    if (collected.length > 0) {
      const candidates = await filesByBasename(root)
      for (const name of collected) {
        const [, hash, original] = COLLECTED_MODULE.exec(name)!
        const matches = await Promise.all(
          (candidates.get(original!) ?? []).map(async (path) => sha1(await readFile(path))),
        )
        if (!matches.includes(hash!)) {
          escapes.push(`a module named "${original}" that is not a file of the project`)
        }
      }
    }

    if (escapes.length > 0) throw new BundleEscapeError(escapes)

    const entries = Object.entries(metafile.outputs)
      .filter(([path, output]) => output.entryPoint !== undefined && path.endsWith('.js'))
      .map(([path]) => resolve(root, path))
    if (entries.length !== 1) {
      throw new Error(
        `Could not check that the bundle stays inside the project: expected one bundled entry, found ${entries.length}`,
      )
    }
    return entries[0]!
  } finally {
    await rm(metaDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * {@link buildContainedBundle} for a run that bundles on its own — a test
 * session, local dev — and only needs the proof: the build is discarded.
 */
export async function assertBundleContained(dir: string): Promise<void> {
  const outdir = await mkdtemp(join(tmpdir(), 'awaitstep-containment-'))
  try {
    await buildContainedBundle(dir, outdir)
  } finally {
    await rm(outdir, { recursive: true, force: true }).catch(() => {})
  }
}
