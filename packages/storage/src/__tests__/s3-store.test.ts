import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3ImageStore } from '../s3-store.js'

// The bucket is stood in for by a stubbed fetch: what is checked is the
// request the store sends (signed, path-style, the object's type) and how it
// reads the answer. The real round trip runs against MinIO in the Docker QA.

const options = {
  endpoint: 'http://minio.test:9000/',
  bucket: 'awaitstep',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
  region: 'us-east-1',
}

function stubFetch(...responses: Response[]) {
  const calls: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      calls.push(new Request(input, init))
      return responses.shift() ?? new Response(null, { status: 200 })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('S3ImageStore', () => {
  it('puts an object path-style, signed, with its type', async () => {
    const calls = stubFetch(new Response(null, { status: 200 }))
    await new S3ImageStore(options).put('img_1', new Uint8Array([1, 2]), 'image/png')
    const [put] = calls
    expect(put!.method).toBe('PUT')
    expect(put!.url).toBe('http://minio.test:9000/awaitstep/images/img_1')
    expect(put!.headers.get('content-type')).toBe('image/png')
    expect(put!.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request/,
    )
    expect(new Uint8Array(await put!.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
  })

  it('reads an object back, and null for one the bucket does not have', async () => {
    stubFetch(new Response(new Uint8Array([7, 8])), new Response('NoSuchKey', { status: 404 }))
    const store = new S3ImageStore(options)
    expect(await store.get('img_1')).toEqual(new Uint8Array([7, 8]))
    expect(await store.get('img_gone')).toBeNull()
  })

  it('throws when the bucket refuses, so the caller does not point at nothing', async () => {
    stubFetch(new Response('AccessDenied', { status: 403 }))
    await expect(
      new S3ImageStore(options).put('img_1', new Uint8Array([1]), 'image/png'),
    ).rejects.toThrow('Image store refused the upload (403)')
  })

  it('deletes each object, taking an already missing one as deleted', async () => {
    const calls = stubFetch(
      new Response(null, { status: 204 }),
      new Response(null, { status: 404 }),
    )
    await new S3ImageStore(options).delete(['img_1', 'img_2'])
    expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ['DELETE', '/awaitstep/images/img_1'],
      ['DELETE', '/awaitstep/images/img_2'],
    ])
  })
})
