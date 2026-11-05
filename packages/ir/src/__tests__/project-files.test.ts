import { describe, expect, it } from 'vitest'
import {
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  PROJECT_IMPORTS_FIELD,
  PROJECT_IMPORT_PREFIX,
  compiledPathKey,
  findProjectPathCollision,
  isGeneratedPath,
  isProjectCodePath,
  isReservedToolchainPath,
  parsePackageManifest,
  projectFileBytes,
  projectFilePathError,
  projectPackageManifest,
  validatePackageManifest,
  packageManifestWriteErrors,
  validateProjectFiles,
  handlerEntry,
  handlerWriteError,
  hasHandlerModules,
  projectHandlerModules,
  projectHandlersConflict,
  projectWriteErrors,
  projectImportCandidates,
} from '../project-files.js'
import { validateArtifact } from '../validate.js'

describe('projectFilePathError', () => {
  it('accepts code, data and docs in any folder, plus root config files', () => {
    for (const path of [
      'config/env.ts',
      'services/stripe/client.js',
      'lib/retry.mts',
      'data/countries.json',
      'README.md',
      'types.d.ts',
      'package.json',
      'tsconfig.json',
      'styles/email.css',
    ]) {
      expect(projectFilePathError(path), path).toBeNull()
    }
  })

  it('rejects traversal, dotfiles, odd segments and unknown extensions', () => {
    expect(projectFilePathError('config/../worker.ts')).toMatch(/unsafe/)
    expect(projectFilePathError('config//x.ts')).toMatch(/unsafe/)
    expect(projectFilePathError('.npmrc')).toMatch(/unsafe/)
    expect(projectFilePathError('config/.env.ts')).toMatch(/unsafe/)
    expect(projectFilePathError('config/with space.ts')).toMatch(/unsafe/)
    expect(projectFilePathError('bin/tool')).toMatch(/must end in/)
    expect(projectFilePathError('image.png')).toMatch(/must end in/)
    expect(projectFilePathError(`${'a'.repeat(300)}.ts`)).toMatch(/exceeds/)
  })

  it('keeps project files off what the canvas generates, in any case or code extension', () => {
    expect(projectFilePathError('worker.ts')).toMatch(/generated/)
    expect(projectFilePathError('worker.js')).toMatch(/generated/)
    expect(projectFilePathError('Worker.mts')).toMatch(/generated/)
    expect(projectFilePathError('nodes/fetch.ts')).toMatch(/generated/)
    expect(projectFilePathError('Nodes/deep/x.ts')).toMatch(/generated/)
    expect(projectFilePathError('wrangler.json')).toMatch(/generated/)
    expect(projectFilePathError('config/Wrangler.toml')).toMatch(/generated/)
    expect(isGeneratedPath('worker.md')).toBe(false)
    expect(isGeneratedPath('workers/x.ts')).toBe(false)
    expect(isGeneratedPath('nodesx.ts')).toBe(false)
  })

  it('refuses lockfiles, node_modules and nested toolchain config', () => {
    expect(projectFilePathError('package-lock.json')).toMatch(/lockfile/)
    expect(projectFilePathError('pnpm-lock.yaml')).toMatch(/lockfile/)
    expect(projectFilePathError('node_modules/x/index.js')).toMatch(/node_modules/)
    expect(projectFilePathError('config/package.json')).toMatch(/project root/)
    expect(projectFilePathError('src/tsconfig.json')).toMatch(/project root/)
  })

  it('still tells codegen which code paths the toolchain would hijack', () => {
    expect(isReservedToolchainPath('config/package.json')).toBe(true)
    expect(isReservedToolchainPath('Package.JSON')).toBe(true)
    expect(isReservedToolchainPath('a/node_modules/b.js')).toBe(true)
    expect(isReservedToolchainPath('yarn.lock')).toBe(true)
    expect(isReservedToolchainPath('config/packages.ts')).toBe(false)
  })

  it('classifies code versus assets by extension', () => {
    expect(isProjectCodePath('config/env.ts')).toBe(true)
    expect(isProjectCodePath('x.cjs')).toBe(true)
    expect(isProjectCodePath('data/countries.json')).toBe(false)
    expect(isProjectCodePath('README.md')).toBe(false)
  })
})

describe('compile-time collisions', () => {
  it('keys paths by their compiled, case-folded form', () => {
    expect(compiledPathKey('Config/Env.ts')).toBe('config/env.js')
    expect(compiledPathKey('a.mts')).toBe('a.mjs')
    expect(compiledPathKey('a.cts')).toBe('a.cjs')
    expect(compiledPathKey('data/x.json')).toBe('data/x.json')
  })

  it('finds the existing file a new path would overwrite', () => {
    const existing = ['config/env.ts', 'data/x.json', 'lib/a.mts']
    expect(findProjectPathCollision('config/env.js', existing)).toBe('config/env.ts')
    expect(findProjectPathCollision('CONFIG/ENV.ts', existing)).toBe('config/env.ts')
    expect(findProjectPathCollision('lib/a.mjs', existing)).toBe('lib/a.mts')
    expect(findProjectPathCollision('config/env.ts', existing)).toBeNull()
    expect(findProjectPathCollision('config/other.ts', existing)).toBeNull()
  })
})

describe('package.json contract', () => {
  it('parses only the honoured fields', () => {
    const manifest = parsePackageManifest(
      JSON.stringify({
        name: 'my-worker',
        version: '1.2.3',
        type: 'module',
        scripts: { postinstall: 'curl evil' },
        workspaces: ['*'],
        dependencies: { zod: '^4.0.0' },
        imports: { '#utils/*': './utils/*.js' },
        engines: { node: '>=22' },
        devDependencies: { vitest: '*' },
      }),
    )
    expect(manifest).toEqual({
      name: 'my-worker',
      version: '1.2.3',
      type: 'module',
      dependencies: { zod: '^4.0.0' },
      imports: { '#utils/*': './utils/*.js' },
      engines: { node: '>=22' },
    })
    expect(parsePackageManifest('[]')).toBeNull()
    expect(parsePackageManifest('nope')).toBeNull()
  })

  it('validates JSON shape, dependency specs, import keys and ESM', () => {
    expect(validatePackageManifest('{')[0].message).toMatch(/valid JSON/)
    expect(validatePackageManifest('"str"')[0].message).toMatch(/JSON object/)
    const errors = validatePackageManifest(
      JSON.stringify({
        type: 'commonjs',
        dependencies: { loot: 'file:/srv', zod: '^4.0.0' },
        imports: { 'utils/*': './utils/*.js' },
        engines: ['22'],
      }),
    )
    expect(errors.map((e) => e.path)).toEqual([
      'package.json.engines',
      'package.json.dependencies.loot',
      'package.json.imports',
      'package.json.type',
    ])
    expect(validatePackageManifest('{"name":"ok","dependencies":{"zod":"^4.0.0"}}')).toEqual([])
  })

  it('refuses import-map targets that climb out of the project, however spelled', () => {
    // Part of the stored-version check, so only actual escapes: a target is a
    // file in the deploy directory, a dependency or a runtime built-in.
    const escapes = [
      '../outside.js',
      './ok/../../up.js',
      '/etc/passwd',
      'file:/srv',
      'https://evil.example/x.js',
      './%2e%2e/%2e%2e/etc/x.js',
      './%2E%2E/x.js',
      './a%2f..%2fb.js',
      'zod/../../../etc/x.js',
    ]
    for (const target of escapes) {
      const errors = validatePackageManifest(JSON.stringify({ imports: { '#x': target } }))
      expect(
        errors.map((e) => e.path),
        target,
      ).toEqual(['package.json.imports'])
    }
  })

  it('keeps validating stored manifests with untidy but contained targets', () => {
    // These cannot escape. Refusing them in the stored-version check would
    // stop a project saved with `"#lib/": "./lib/"` from deploying.
    const contained = [
      './lib/util.js',
      './lib/*.js',
      './lib/',
      './lib/./x.js',
      './/x.js',
      './node_modules/zod/index.js',
      './%zz.js',
      'zod',
      '@scope/pkg/sub',
      'cloudflare:workers',
      'node:buffer',
      'workerd:x',
    ]
    for (const target of contained) {
      expect(
        validatePackageManifest(JSON.stringify({ imports: { '#x': target } })),
        target,
      ).toEqual([])
    }
  })

  it('refuses untidy targets only when package.json itself is written', () => {
    const untidy = ['./lib/', './lib/./x.js', './/x.js', './node_modules/zod/index.js', './%zz.js']
    for (const target of untidy) {
      const errors = packageManifestWriteErrors(JSON.stringify({ imports: { '#x': target } }))
      expect(
        errors.map((e) => e.path),
        target,
      ).toEqual(['package.json'])
    }
    const tidy = ['./lib/util.js', './lib/*.js', 'zod', '@scope/pkg/sub', 'cloudflare:workers']
    for (const target of tidy) {
      expect(
        packageManifestWriteErrors(JSON.stringify({ imports: { '#x': target } })),
        target,
      ).toEqual([])
    }
  })

  it('finds the project manifest among files', () => {
    expect(projectPackageManifest([{ path: 'config/a.ts', source: '' }])).toBeNull()
    expect(
      projectPackageManifest([{ path: 'package.json', source: '{"dependencies":{"zod":"*"}}' }]),
    ).toEqual({ dependencies: { zod: '*' } })
  })
})

describe('validateProjectFiles', () => {
  it('passes a well-formed set', () => {
    expect(
      validateProjectFiles([
        { path: 'config/env.ts', source: 'export const a = 1' },
        { path: 'package.json', source: '{"name":"w"}' },
      ]),
    ).toEqual([])
  })

  it('reports path problems, duplicates, compile collisions and manifest errors with their index', () => {
    const errors = validateProjectFiles([
      { path: 'config/env.ts', source: '' },
      { path: 'config/env.ts', source: '' },
      { path: 'config/env.js', source: '' },
      { path: 'worker.ts', source: '' },
      { path: 'package.json', source: '{"type":"commonjs"}' },
    ])
    expect(errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      'runtime.files[1].path: Duplicate project file "config/env.ts"',
      'runtime.files[2].path: "config/env.js" would overwrite "config/env.ts" after compile',
      'runtime.files[4].source.type: Workers deploy as ES modules — use "module"',
    ])
  })

  it('still refuses a new write to a generated path', () => {
    expect(projectFilePathError('awaitstep/util.ts')).toBe('is generated from the canvas')
    expect(projectFilePathError('worker.ts')).toBe('is generated from the canvas')
  })

  it('lets a stored snapshot keep a path that is generated today', () => {
    // Reserving a path must not make an old version unopenable; the
    // generated-path rule is write-time only.
    expect(validateProjectFiles([{ path: 'awaitstep/util.ts', source: '' }])).toEqual([])
    expect(validateProjectFiles([{ path: 'worker.ts', source: '' }])).toEqual([])
  })

  it('enforces the per-file, total and count caps in UTF-8 bytes', () => {
    const big = 'é'.repeat(MAX_PROJECT_FILE_BYTES / 2 + 1)
    expect(projectFileBytes(big)).toBeGreaterThan(MAX_PROJECT_FILE_BYTES)
    expect(validateProjectFiles([{ path: 'big.ts', source: big }])[0].message).toMatch(
      /exceeds 512000 bytes/,
    )

    const chunk = 'x'.repeat(MAX_PROJECT_FILE_BYTES)
    const many = Array.from({ length: 4 }, (_, i) => ({ path: `c${i}.ts`, source: chunk }))
    expect(validateProjectFiles(many).map((e) => e.message)).toContain(
      `Project files exceed ${MAX_PROJECT_TOTAL_BYTES} bytes in total`,
    )

    const tooMany = Array.from({ length: MAX_PROJECT_FILES + 1 }, (_, i) => ({
      path: `f${i}.ts`,
      source: '',
    }))
    expect(validateProjectFiles(tooMany)[0].message).toMatch(/Maximum 100/)
  })

  it('runs as part of artifact validation', () => {
    const result = validateArtifact({
      metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'n1',
      nodes: [
        {
          id: 'n1',
          type: 'step',
          name: 'n1',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 1;' },
        },
      ],
      edges: [],
      runtime: { files: [{ path: 'image.png', source: 'nope' }] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === 'runtime.files[0].path')).toBe(true)
    }
  })
})

describe('handler modules', () => {
  it('recognises the three entries by stem and the queue name by file name', () => {
    expect(handlerEntry('handlers/fetch.ts')).toEqual({ kind: 'fetch' })
    expect(handlerEntry('handlers/fetch.js')).toEqual({ kind: 'fetch' })
    expect(handlerEntry('handlers/scheduled.mts')).toEqual({ kind: 'scheduled' })
    expect(handlerEntry('handlers/queue/orders-v2.ts')).toEqual({
      kind: 'queue',
      queue: 'orders-v2',
    })
    for (const bad of [
      'handlers/util.ts',
      'handlers/queue/Orders.ts',
      'handlers/queue/a/b.ts',
      'handlers/queue/-x.ts',
      'handlers/fetch.md',
      'handlers.ts',
      'lib/handlers/fetch.ts',
    ]) {
      expect(handlerEntry(bad), bad).toBeNull()
    }
  })

  it('keeps path validation free of handler rules, so older versions still validate', () => {
    for (const path of [
      'handlers/fetch.ts',
      'handlers/queue/orders.ts',
      'handlers/util.ts',
      'handlers/README.md',
      'handlers/Fetch.ts',
      'handlers/queue/Orders.ts',
    ]) {
      expect(projectFilePathError(path), path).toBeNull()
    }
  })

  it('refuses writing an inert look-alike or a second file for one entry', () => {
    expect(handlerWriteError('handlers/fetch.ts', [])).toBeNull()
    expect(handlerWriteError('handlers/util.ts', [])).toBeNull()
    expect(handlerWriteError('handlers/README.md', [])).toBeNull()
    expect(handlerWriteError('lib/fetch.ts', [])).toBeNull()
    expect(handlerWriteError('handlers/Fetch.ts', [])).toMatch(/did you mean handlers\/fetch.ts/)
    expect(handlerWriteError('handlers/scheduled.md', [])).toMatch(/did you mean/)
    expect(handlerWriteError('handlers/queue/Orders.ts', [])).toMatch(/not a queue consumer/)
    expect(handlerWriteError('handlers/queue/order_events.ts', [])).toMatch(/not a queue consumer/)

    // One file per entry: a second extension for the same role is refused.
    expect(handlerWriteError('handlers/fetch.mjs', ['handlers/fetch.ts'])).toMatch(
      /second fetch handler beside "handlers\/fetch.ts"/,
    )
    expect(handlerWriteError('handlers/queue/orders.mjs', ['handlers/queue/orders.ts'])).toMatch(
      /second consumer for "orders"/,
    )
    // Replacing the same path, and a different queue, are both fine.
    expect(handlerWriteError('handlers/fetch.ts', ['handlers/fetch.ts'])).toBeNull()
    expect(handlerWriteError('handlers/queue/other.ts', ['handlers/queue/orders.ts'])).toBeNull()
  })

  it('settles duplicate entries in older versions by the lowest path, deduping queues', () => {
    const modules = projectHandlerModules([
      { path: 'handlers/fetch.mjs' },
      { path: 'handlers/fetch.ts' },
      { path: 'handlers/queue/orders.ts' },
      { path: 'handlers/queue/orders.mjs' },
      { path: 'handlers/shared.ts' },
    ])
    expect(modules).toEqual({
      fetch: 'handlers/fetch.mjs',
      queues: [{ queue: 'orders', path: 'handlers/queue/orders.mjs' }],
      shared: 'handlers/shared.ts',
    })
    // The shared module alone is not an entry: the project is still legacy.
    expect(hasHandlerModules(projectHandlerModules([{ path: 'handlers/shared.ts' }]))).toBe(false)
  })

  it('collects a project’s handler modules by role, queues sorted', () => {
    const modules = projectHandlerModules([
      { path: 'handlers/queue/zeta.ts' },
      { path: 'lib/x.ts' },
      { path: 'handlers/fetch.ts' },
      { path: 'handlers/queue/alpha.ts' },
    ])
    expect(modules).toEqual({
      fetch: 'handlers/fetch.ts',
      queues: [
        { queue: 'alpha', path: 'handlers/queue/alpha.ts' },
        { queue: 'zeta', path: 'handlers/queue/zeta.ts' },
      ],
    })
    expect(modules.shared).toBeUndefined()
    expect(hasHandlerModules(modules)).toBe(true)
    expect(hasHandlerModules(projectHandlerModules([{ path: 'lib/x.ts' }]))).toBe(false)
    expect(hasHandlerModules(projectHandlerModules(undefined))).toBe(false)
  })

  it('never lets the annotation file and the handler folder coexist', () => {
    expect(projectHandlersConflict('handlers/fetch.ts', ['handlers.ts'])).toMatch(/convert/)
    expect(projectHandlersConflict('handlers.ts', ['handlers/queue/orders.ts'])).toMatch(
      /already uses handler modules/,
    )
    expect(projectHandlersConflict('handlers/fetch.ts', ['lib/x.ts'])).toBeNull()
    expect(projectHandlersConflict('lib/x.ts', ['handlers.ts'])).toBeNull()
    const errors = validateProjectFiles([
      { path: 'handlers.ts', source: '' },
      { path: 'handlers/fetch.ts', source: '' },
    ])
    expect(errors.map((e) => e.message)).toContain('handlers.ts and handlers/ cannot coexist')
  })
})

describe('projectWriteErrors', () => {
  it('judges one write exactly as the single-path rules do', () => {
    expect(projectWriteErrors(['handlers/fetch.ts'], ['handlers/fetch.ts'])).toEqual([])
    expect(projectWriteErrors(['lib/x.ts'], ['lib/x.ts', 'handlers.ts'])).toEqual([])
    expect(projectWriteErrors(['handlers/fetch.ts'], ['handlers.ts', 'handlers/fetch.ts'])).toEqual(
      [
        {
          path: 'handlers/fetch.ts',
          message: projectHandlersConflict('handlers/fetch.ts', ['handlers.ts'])!,
        },
      ],
    )
  })

  it('reuses the write endpoint’s wording for a handler path', () => {
    expect(projectWriteErrors(['handlers/Fetch.ts'], ['handlers/Fetch.ts'])).toEqual([
      {
        path: 'handlers/Fetch.ts',
        message:
          'Invalid handler path "handlers/Fetch.ts": would never run — did you mean handlers/fetch.ts?',
      },
    ])
  })

  it('catches a pair of changes that only conflict with each other', () => {
    // Neither write is wrong on its own against an empty project; together
    // they are two files for one role. Judging each against the merged set
    // is what sees it.
    const changed = ['handlers/fetch.ts', 'handlers/fetch.mjs']
    expect(projectWriteErrors(changed, changed)).toEqual([
      {
        path: 'handlers/fetch.ts',
        message:
          'Invalid handler path "handlers/fetch.ts": would be a second fetch handler beside "handlers/fetch.mjs" — one file per entry',
      },
      {
        path: 'handlers/fetch.mjs',
        message:
          'Invalid handler path "handlers/fetch.mjs": would be a second fetch handler beside "handlers/fetch.ts" — one file per entry',
      },
    ])
  })

  it('allows a swap that removes the file it would have conflicted with', () => {
    // handlers.ts out, handlers/fetch.ts in: the merged set never holds
    // both, so the write stands. A set judged against what is stored today
    // would refuse it.
    expect(projectWriteErrors(['handlers/fetch.ts'], ['handlers/fetch.ts', 'lib/x.ts'])).toEqual([])
  })

  it('reports one error per refused path and leaves the rest alone', () => {
    const errors = projectWriteErrors(
      ['lib/ok.ts', 'handlers/queue/Orders.ts'],
      ['lib/ok.ts', 'handlers/queue/Orders.ts'],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe('handlers/queue/Orders.ts')
    expect(errors[0]!.message).toMatch(/^Invalid handler path .*not a queue consumer/)
  })

  it('says nothing about files that merely exist', () => {
    // A stored version that predates the convention keeps deploying: only
    // what is being written is judged.
    expect(
      projectWriteErrors([], ['handlers/Fetch.ts', 'handlers.ts', 'handlers/fetch.ts']),
    ).toEqual([])
  })
})

describe('import conventions', () => {
  it('uses a Node-valid named prefix and one map entry per extension', () => {
    expect(PROJECT_IMPORT_PREFIX).toBe('#app/')
    expect(Object.keys(PROJECT_IMPORTS_FIELD).every((k) => k.startsWith('#app/'))).toBe(true)
    expect(PROJECT_IMPORTS_FIELD['#app/*']).toBe('./*.js')
    expect(PROJECT_IMPORTS_FIELD['#app/*.json']).toBe('./*.json')
    expect(PROJECT_IMPORTS_FIELD['#app/*.mts']).toBe('./*.mjs')
  })
})

describe('projectImportCandidates', () => {
  it('maps an extensionless target to .js, its .ts source and a declaration file', () => {
    expect(projectImportCandidates('lib/x')).toEqual(['lib/x.js', 'lib/x.ts', 'lib/x.d.ts'])
  })

  it('never offers a folder index for a bare folder', () => {
    expect(projectImportCandidates('lib')).not.toContain('lib/index.ts')
  })

  it('maps explicit extensions to the file they name or compile from', () => {
    expect(projectImportCandidates('lib/x.mts')).toEqual(['lib/x.mjs', 'lib/x.mts'])
    expect(projectImportCandidates('lib/x.mjs')).toEqual(['lib/x.mjs', 'lib/x.mts'])
    expect(projectImportCandidates('lib/x.json')).toEqual(['lib/x.json'])
  })
})

describe('projectImportCandidates with prototype-named extensions', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'treats x.%s as an unknown extension and returns the defaults',
    (name) => {
      expect(projectImportCandidates(`x.${name}`)).toEqual([
        `x.${name}.js`,
        `x.${name}.ts`,
        `x.${name}.d.ts`,
      ])
    },
  )
})
