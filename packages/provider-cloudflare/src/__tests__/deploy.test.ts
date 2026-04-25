import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deployWithWrangler } from '../deploy.js'
import { WRANGLER_BASE_CONFIG } from '../wrangler-config.js'
import type { GeneratedArtifact } from '@awaitstep/codegen'

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}))

const mockExecFile = vi.fn()
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      err: Error | null,
      result: { stdout: string; stderr: string },
    ) => void
    const result = mockExecFile(...args)
    if (result instanceof Error) {
      cb(result, { stdout: '', stderr: '' })
    } else {
      cb(null, { stdout: result?.stdout ?? 'deployed', stderr: result?.stderr ?? '' })
    }
  },
}))

const artifact: GeneratedArtifact = {
  filename: 'worker.js',
  source: 'export class Test {}',
  compiled: 'export class Test {}',
}

const options = {
  workflowId: 'my-workflow',
  workflowName: 'my-workflow',
  accountId: 'abc123',
  apiToken: 'token123',
}

describe('deployWithWrangler', () => {
  beforeEach(() => {
    mockExecFile.mockReset()
    mockExecFile.mockReturnValue({ stdout: 'deployed successfully', stderr: '' })
  })

  it('returns success when wrangler deploy succeeds', async () => {
    const result = await deployWithWrangler(artifact, options)
    expect(result.success).toBe(true)
    expect(result.workerName).toBe('awaitstep-my-workflow')
    expect(result.error).toBeUndefined()
  })

  it('returns failure when wrangler deploy fails', async () => {
    mockExecFile.mockReturnValue(
      Object.assign(new Error('deploy failed'), { stdout: '', stderr: 'error details' }),
    )
    const result = await deployWithWrangler(artifact, options)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('uses compiled code when available', async () => {
    const { writeFile } = await import('node:fs/promises')
    await deployWithWrangler(artifact, options)
    const writeFileMock = vi.mocked(writeFile)
    const scriptWrite = writeFileMock.mock.calls.find(
      (call) =>
        (call[0] as string).endsWith('worker.js') && !(call[0] as string).endsWith('wrangler.json'),
    )
    expect(scriptWrite?.[1]).toBe('export class Test {}')
  })

  it('cleans up temp dir on failure', async () => {
    mockExecFile.mockReturnValue(Object.assign(new Error('fail'), { stdout: '', stderr: '' }))
    const { rm } = await import('node:fs/promises')
    await deployWithWrangler(artifact, options)
    expect(rm).toHaveBeenCalled()
  })

  it('throws on empty workflowId', async () => {
    await expect(deployWithWrangler(artifact, { ...options, workflowId: '!!!' })).rejects.toThrow(
      'at least one alphanumeric',
    )
  })

  it('uses base config compatibility date', async () => {
    const { writeFile } = await import('node:fs/promises')
    await deployWithWrangler(artifact, options)
    const writeFileMock = vi.mocked(writeFile)
    const configWrite = writeFileMock.mock.calls.find((call) =>
      (call[0] as string).endsWith('wrangler.json'),
    )
    const content = configWrite?.[1] as string
    expect(content).toContain(WRANGLER_BASE_CONFIG.compatibility_date)
  })

  it('uploads secrets via `wrangler secret bulk` with a JSON file', async () => {
    const { writeFile, rm } = await import('node:fs/promises')
    const writeFileMock = vi.mocked(writeFile)
    const rmMock = vi.mocked(rm)
    writeFileMock.mockClear()
    rmMock.mockClear()

    await deployWithWrangler(artifact, {
      ...options,
      secrets: { AWS_ACCESS_KEY_ID: 'AKIA', AWS_SECRET_ACCESS_KEY: 's3cr3t' },
    })

    const bulkCall = mockExecFile.mock.calls.find(
      (call) =>
        Array.isArray(call[1]) &&
        (call[1] as string[]).includes('secret') &&
        (call[1] as string[]).includes('bulk'),
    )
    expect(bulkCall).toBeDefined()
    const args = bulkCall![1] as string[]
    expect(args).toEqual([
      'wrangler',
      'secret',
      'bulk',
      '.secrets.bulk.json',
      '--name',
      'awaitstep-my-workflow',
    ])

    const bulkWrite = writeFileMock.mock.calls.find((call) =>
      (call[0] as string).endsWith('.secrets.bulk.json'),
    )
    expect(bulkWrite).toBeDefined()
    expect(JSON.parse(bulkWrite![1] as string)).toEqual({
      AWS_ACCESS_KEY_ID: 'AKIA',
      AWS_SECRET_ACCESS_KEY: 's3cr3t',
    })

    const secretsRm = rmMock.mock.calls.find((call) =>
      (call[0] as string).endsWith('.secrets.bulk.json'),
    )
    expect(secretsRm).toBeDefined()
  })

  it('skips the bulk call when no secrets are provided', async () => {
    await deployWithWrangler(artifact, options)
    const bulkCall = mockExecFile.mock.calls.find(
      (call) =>
        Array.isArray(call[1]) &&
        (call[1] as string[]).includes('secret') &&
        (call[1] as string[]).includes('bulk'),
    )
    expect(bulkCall).toBeUndefined()
  })
})
