import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createQuickTestSandbox,
  SANDBOX_BOOT_TIMEOUT_MS,
  type QuickTestSandbox,
  type QuickTestSandboxCallbacks,
} from '../ide/quick-test-sandbox'
import { WORKER_ALIVE } from '../ide/quick-test'

/**
 * The boundary's shape and its protocol, over a hand-rolled document and
 * channel: the sandbox attribute, the injection path, the init handshake, the
 * ready/flush order, the error routing, the teardown. What cannot be proven
 * without a browser — cookies absent, API unreachable, the bootstrap actually
 * executing — is a browser check in the QA notes.
 */

class FakePort {
  onmessage: ((event: { data: unknown }) => void) | null = null
  closed = false
  readonly sent: unknown[] = []
  peer!: FakePort

  postMessage(data: unknown) {
    this.sent.push(data)
    this.peer.onmessage?.({ data })
  }
  close() {
    this.closed = true
  }
}

class FakeMessageChannel {
  port1 = new FakePort()
  port2 = new FakePort()
  constructor() {
    this.port1.peer = this.port2
    this.port2.peer = this.port1
  }
}

class FakeContentWindow {
  readonly posted: { data: unknown; transfer: unknown[] }[] = []
  postMessage(data: unknown, _origin: string, transfer: unknown[] = []) {
    this.posted.push({ data, transfer })
  }
}

class FakeIframe {
  private attributes = new Map<string, string>()
  private loadHandlers: { handler: () => void; once: boolean }[] = []
  style: { display: string } = { display: '' }
  srcdoc = ''
  contentWindow = new FakeContentWindow()
  attached = false

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }
  addEventListener(type: string, handler: () => void, options?: { once?: boolean }) {
    if (type === 'load') this.loadHandlers.push({ handler, once: options?.once ?? false })
  }
  remove() {
    this.attached = false
  }
  fireLoad() {
    const handlers = [...this.loadHandlers]
    this.loadHandlers = this.loadHandlers.filter((entry) => !entry.once)
    for (const entry of handlers) entry.handler()
  }
}

let iframes: FakeIframe[] = []
let handles: QuickTestSandbox[] = []
let events: string[] = []

const callbacks: QuickTestSandboxCallbacks = {
  onMessage(data) {
    events.push(`message:${JSON.stringify(data)}`)
  },
  onLoadError(message) {
    events.push(`load-error:${message}`)
  },
  onUnavailable(message) {
    events.push(`unavailable:${message}`)
  },
  onStarted() {
    events.push('started')
  },
}

const fakeDocument = {
  createElement(tag: string) {
    expect(tag).toBe('iframe')
    const iframe = new FakeIframe()
    iframes.push(iframe)
    return iframe
  },
  body: {
    appendChild(node: FakeIframe) {
      node.attached = true
    },
  },
}

function create(workerSource = '// step'): QuickTestSandbox {
  const sandbox = createQuickTestSandbox(workerSource, callbacks)
  handles.push(sandbox)
  return sandbox
}

function onlyIframe(): FakeIframe {
  expect(iframes).toHaveLength(1)
  return iframes[0]!
}

/** Boot the sandbox the way the bootstrap would, returning its end of the channel. */
function boot(iframe: FakeIframe): FakePort {
  iframe.fireLoad()
  const init = iframe.contentWindow.posted[0]!
  expect(init.data).toMatchObject({ type: 'init' })
  const port = init.transfer[0] as FakePort
  port.postMessage({ type: 'ready' })
  return port
}

beforeEach(() => {
  iframes = []
  handles = []
  events = []
  vi.useFakeTimers()
  vi.stubGlobal('document', fakeDocument)
  vi.stubGlobal('MessageChannel', FakeMessageChannel)
})

afterEach(() => {
  for (const handle of handles) handle.destroy()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createQuickTestSandbox — the boundary', () => {
  it('gives the iframe an opaque origin: allow-scripts and nothing else', () => {
    // This attribute IS the security boundary. `allow-same-origin` here
    // would hand marketplace-template code the user's session.
    create()

    const iframe = onlyIframe()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.style.display).toBe('none')
    expect(iframe.attached).toBe(true)
  })

  it('never writes the step code into the document — it travels by message', () => {
    // Interpolating user code into srcdoc would let `</script>` break out of
    // the bootstrap and run in the iframe window instead of the worker.
    create('</scr' + 'ipt><scr' + 'ipt>globalThis.evil = 1')

    expect(onlyIframe().srcdoc).not.toContain('evil')
    onlyIframe().fireLoad()
    const init = onlyIframe().contentWindow.posted[0]!
    expect(init.data).toMatchObject({ type: 'init', workerSource: expect.stringContaining('evil') })
  })

  it('posts the port exactly once, even if load fires again', () => {
    // A port can only be transferred once; a second post would throw and
    // leave the run hanging until the timeout.
    create()

    const iframe = onlyIframe()
    iframe.fireLoad()
    iframe.fireLoad()

    expect(iframe.contentWindow.posted).toHaveLength(1)
  })
})

describe('createQuickTestSandbox — the protocol', () => {
  it('buffers a start until ready, then flushes it exactly once', () => {
    const sandbox = create()
    sandbox.start({ inputs: { a: 1 } })
    expect(events).toEqual([])

    const port = boot(onlyIframe())

    expect(events).toEqual(['started'])
    expect(port.peer.sent).toEqual([{ type: 'start', args: { inputs: { a: 1 } } }])
  })

  it('starts immediately once ready', () => {
    const sandbox = create()
    const port = boot(onlyIframe())

    sandbox.start({ inputs: {} })

    expect(events).toEqual(['started'])
    expect(port.peer.sent).toEqual([{ type: 'start', args: { inputs: {} } }])
  })

  it('routes worker messages, load errors and refusals to their callbacks', () => {
    create()
    const port = boot(onlyIframe())

    port.postMessage({ type: 'worker', data: { type: 'done', result: '1' } })
    port.postMessage({ type: 'worker-error', message: 'bad token' })
    port.postMessage({ type: 'sandbox-unavailable', message: 'no workers' })

    expect(events).toEqual([
      'message:{"type":"done","result":"1"}',
      'load-error:bad token',
      'unavailable:no workers',
    ])
  })

  it('an undescribed worker error before the worker ran is the sandbox refusing', () => {
    create()
    const port = boot(onlyIframe())

    port.postMessage({ type: 'worker-error', message: '' })

    expect(events).toEqual([expect.stringMatching(/^unavailable:/)])
  })

  it('an undescribed worker error after the worker ran is the step failing', () => {
    // Reported as "unavailable", a step that had been running — and logging —
    // was blamed on the browser.
    create()
    const port = boot(onlyIframe())

    port.postMessage({ type: 'worker', data: { type: WORKER_ALIVE } })
    port.postMessage({ type: 'worker', data: { type: 'log', level: 'log', text: 'hi' } })
    port.postMessage({ type: 'worker-error', message: '' })

    expect(events).toEqual([
      'message:{"type":"log","level":"log","text":"hi"}',
      expect.stringMatching(/^load-error:.+/),
    ])
  })

  it('reports a sandbox that never boots, instead of letting the run time out', () => {
    create()

    vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS)

    expect(events).toEqual([expect.stringMatching(/^unavailable:.*did not boot/)])
  })

  it('a ready sandbox never reports the boot timeout', () => {
    create()
    boot(onlyIframe())

    vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS * 2)

    expect(events).toEqual([])
  })

  it('tells the bootstrap to stop the worker on destroy, then goes quiet', () => {
    const sandbox = create()
    const port = boot(onlyIframe())

    sandbox.destroy()

    expect(port.peer.sent).toContainEqual({ type: 'stop' })
    expect(port.peer.closed).toBe(true)
    expect(onlyIframe().attached).toBe(false)

    port.postMessage({ type: 'worker', data: { type: 'done' } })
    sandbox.start({ inputs: {} })
    expect(events).toEqual([])
  })

  it('ignores a load that fires after destroy', () => {
    const sandbox = create()
    sandbox.destroy()

    onlyIframe().fireLoad()

    expect(onlyIframe().contentWindow.posted).toEqual([])
  })
})
