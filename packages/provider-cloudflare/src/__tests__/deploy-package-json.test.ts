import { describe, it, expect } from 'vitest'
import type { GeneratedBundle } from '@awaitstep/codegen'
import { toBundle } from '@awaitstep/codegen'
import { AWAITSTEP_IMPORTS_FIELD } from '@awaitstep/codegen'
import { PROJECT_IMPORTS_FIELD } from '@awaitstep/ir'
import { SandboxWranglerDeployer } from '../deploy/sandbox-deployer.js'

interface FakeSandbox {
  files: Map<string, string>
  commands: string[]
  writeFile(path: string, content: string): Promise<void>
  exec(
    command: string,
    options?: Record<string, unknown>,
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  destroy(): Promise<void>
}

function makeFakeSandbox(): FakeSandbox {
  const fake: FakeSandbox = {
    files: new Map(),
    commands: [],
    async writeFile(path, content) {
      fake.files.set(path, content)
    },
    async exec(command) {
      fake.commands.push(command)
      const stdout = command.includes('wrangler deploy') ? 'https://w.example.workers.dev' : ''
      return { success: true, stdout, stderr: '', exitCode: 0 }
    },
    async destroy() {},
  }
  return fake
}

const bundle = toBundle({ filename: 'worker.js', source: 'export default {}' })
const baseOptions = {
  workflowId: 'wf',
  workflowName: 'wf',
  accountId: 'acc',
  apiToken: 'tok',
}

async function deployWith(bundleToDeploy: GeneratedBundle, options = baseOptions) {
  const sandbox = makeFakeSandbox()
  const deployer = new SandboxWranglerDeployer(() => sandbox)
  const result = await deployer.deploy(bundleToDeploy, options)
  expect(result.success).toBe(true)
  return sandbox
}

describe('deploy package.json', () => {
  it('is written with the #app import map even when there are no dependencies', async () => {
    const sandbox = await deployWith(bundle)
    const manifest = JSON.parse(sandbox.files.get('/workspace/package.json')!)
    expect(manifest).toMatchObject({
      name: 'awaitstep-worker',
      imports: { ...PROJECT_IMPORTS_FIELD, ...AWAITSTEP_IMPORTS_FIELD },
    })
    expect(manifest).not.toHaveProperty('dependencies')
    expect(sandbox.commands.some((c) => c.startsWith('npm install'))).toBe(false)
  })

  it('installs only when dependencies are declared', async () => {
    const sandbox = await deployWith(bundle, { ...baseOptions, dependencies: { zod: '^4.0.0' } })
    const manifest = JSON.parse(sandbox.files.get('/workspace/package.json')!)
    expect(manifest.dependencies).toEqual({ zod: '^4.0.0' })
    expect(sandbox.commands.some((c) => c.startsWith('npm install'))).toBe(true)
  })

  it('merges the project manifest, writes code and assets, and never config/meta files', async () => {
    const projectBundle: GeneratedBundle = {
      entry: 'worker.js',
      files: [
        { path: 'worker.js', source: 'export default {}', role: 'entry' },
        { path: 'config/env.js', source: 'export const a = 1', role: 'module' },
        { path: 'data/x.json', source: '[1]', role: 'asset' },
        { path: 'tsconfig.json', source: '{"compilerOptions":{"baseUrl":"/"}}', role: 'config' },
        {
          path: 'package.json',
          source: JSON.stringify({ name: 'custom', scripts: { postinstall: 'x' } }),
          role: 'meta',
        },
      ],
    }
    const sandbox = await deployWith(projectBundle, {
      ...baseOptions,
      dependencies: { zod: '^4.0.0' },
    })
    expect(sandbox.files.get('/workspace/config/env.js')).toBe('export const a = 1')
    expect(sandbox.files.get('/workspace/data/x.json')).toBe('[1]')
    expect(sandbox.files.has('/workspace/tsconfig.json')).toBe(false)
    const manifest = JSON.parse(sandbox.files.get('/workspace/package.json')!)
    expect(manifest).toEqual({
      name: 'custom',
      private: true,
      type: 'module',
      imports: { ...PROJECT_IMPORTS_FIELD, ...AWAITSTEP_IMPORTS_FIELD },
      dependencies: { zod: '^4.0.0' },
    })
    expect(sandbox.commands.some((c) => c.startsWith('mkdir -p config data'))).toBe(true)
  })
})
