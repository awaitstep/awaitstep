import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const listening = new Set<number>()
const killedPorts: number[] = []

vi.mock('../../local-dev.js', () => ({
  isPortListening: (port: number) => Promise.resolve(listening.has(port)),
  killPort: (port: number) => {
    killedPorts.push(port)
    return Promise.resolve()
  },
}))

const { NodeTestSessionRunner, TEST_SESSION_PORT_RANGE, releaseClaimedPorts } =
  await import('../../test-sessions/node-runner.js')

describe('NodeTestSessionRunner', () => {
  beforeEach(() => {
    listening.clear()
    killedPorts.length = 0
    releaseClaimedPorts()
  })

  it('gives each session its own workspace directory', () => {
    const runner = new NodeTestSessionRunner()
    const first = runner.containerId('s-1')
    const second = runner.containerId('s-2')
    expect(first).not.toBe(second)
    expect(first).toContain('awaitstep-test-sessions')
  })

  describe('port allocation', () => {
    // Exercised through start()'s failure path: several sessions run at once,
    // so unlike local dev there is no single fixed port to take.
    async function allocate(runner: InstanceType<typeof NodeTestSessionRunner>) {
      // @ts-expect-error reaching the private allocator; spawning a real
      // wrangler just to observe which port it picked would be a worse test.
      return runner.claimPort() as Promise<number>
    }

    it('takes the first free port in the range', async () => {
      const runner = new NodeTestSessionRunner()
      expect(await allocate(runner)).toBe(TEST_SESSION_PORT_RANGE.from)
    })

    it('never hands the same port to two overlapping starts', async () => {
      // Choosing a port and binding it are not one step: without a claim the
      // second start finds the first's worker, calls it ready, and sends its
      // triggers to someone else's workflow.
      const runner = new NodeTestSessionRunner()
      const first = await allocate(runner)
      const second = await allocate(runner)
      expect(second).not.toBe(first)
    })

    it('skips ports already in use', async () => {
      listening.add(TEST_SESSION_PORT_RANGE.from)
      listening.add(TEST_SESSION_PORT_RANGE.from + 1)
      const runner = new NodeTestSessionRunner()
      expect(await allocate(runner)).toBe(TEST_SESSION_PORT_RANGE.from + 2)
    })

    it('refuses rather than colliding when the range is full', async () => {
      const portRange = { from: 9000, to: 9001 }
      listening.add(9000)
      listening.add(9001)
      const runner = new NodeTestSessionRunner({ portRange })
      await expect(allocate(runner)).rejects.toThrow(/No free port/)
    })
  })

  describe('logs', () => {
    let dir: string

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'awaitstep-node-runner-'))
    })

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    it('reads the session log file and pages it', async () => {
      // One JSON object per line, as the runner appends them.
      await writeFile(
        join(dir, 'output.log'),
        [
          JSON.stringify({
            timestamp: 1,
            stream: 'stdout',
            text: 'Ready on http://localhost:8800',
          }),
          JSON.stringify({ timestamp: 2, stream: 'stderr', text: 'warn' }),
          '',
        ].join('\n'),
        'utf-8',
      )
      const runner = new NodeTestSessionRunner()
      const handle = { sessionId: 's', containerId: dir, processId: '1', port: 8800 }

      const page = await runner.logs(handle)
      expect(page.entries.map((e) => e.text)).toEqual(['Ready on http://localhost:8800', 'warn'])
      expect((await runner.logs(handle, page.cursor)).entries).toEqual([])
    })

    it('reports nothing rather than failing when the session has written none', async () => {
      // The file appears only once the child produces output; a poll that
      // arrives first must not error.
      const runner = new NodeTestSessionRunner()
      const page = await runner.logs({
        sessionId: 's',
        containerId: join(dir, 'missing'),
        processId: '1',
        port: 8800,
      })
      expect(page).toEqual({ entries: [], cursor: '0' })
    })
  })

  describe('stop', () => {
    it('stops the process group and removes the workspace', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'awaitstep-node-runner-'))
      await mkdir(join(dir, 'nested'), { recursive: true })
      const runner = new NodeTestSessionRunner()

      await runner.stop({ sessionId: 's', containerId: dir, processId: '0', port: 8800 })

      // Never by port: ports are reused, so a late stop would kill whichever
      // session now holds it — and the port-killer's macOS path can match the
      // API's own connections and SIGKILL the API.
      expect(killedPorts).toEqual([])
      await expect(access(dir)).rejects.toThrow()
    })

    it('copes with a session that never started', async () => {
      const runner = new NodeTestSessionRunner()
      // No pid and no port: what the reaper holds for a reservation whose
      // start never reported back.
      await expect(
        runner.stop({ sessionId: 's', containerId: join(tmpdir(), 'awaitstep-none') }),
      ).resolves.toBeUndefined()
      expect(killedPorts).toEqual([])
    })
  })
})
