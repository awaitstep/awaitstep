import { AwsClient } from 'aws4fetch'
import type { ImageStore, ImageType } from './image-store.js'

/** An S3-compatible bucket: R2, S3, GCS in S3 mode, MinIO. */
export interface S3StoreOptions {
  /** The service's origin, e.g. `https://<account>.r2.cloudflarestorage.com` or `http://minio:9000`. */
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** `auto` for R2; the bucket's region elsewhere. */
  region?: string
  /** Prepended to every object key. */
  keyPrefix?: string
}

// Requests are signed with SigV4 by aws4fetch, which only needs `fetch` and
// Web Crypto, so the same store runs on Node and in a Worker. Addresses are
// path-style (`endpoint/bucket/key`), which every S3-compatible service
// takes. The bucket stays private: the API reads objects and serves them
// itself, and no client ever sees a bucket URL or key.
export class S3ImageStore implements ImageStore {
  readonly kind = 'bucket'
  private client: AwsClient
  private base: string
  private prefix: string

  constructor(options: S3StoreOptions) {
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: 's3',
      region: options.region ?? 'auto',
    })
    this.base = `${options.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(options.bucket)}`
    this.prefix = options.keyPrefix ?? 'images/'
  }

  private url(id: string): string {
    return `${this.base}/${this.prefix}${encodeURIComponent(id)}`
  }

  async put(id: string, bytes: Uint8Array, type: ImageType): Promise<void> {
    const res = await this.client.fetch(this.url(id), {
      method: 'PUT',
      // A copy typed on a plain ArrayBuffer, which `fetch` takes as a body.
      body: new Uint8Array(bytes),
      headers: { 'Content-Type': type },
    })
    if (!res.ok) throw new Error(`Image store refused the upload (${res.status})`)
  }

  async get(id: string): Promise<Uint8Array | null> {
    const res = await this.client.fetch(this.url(id))
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Image store refused the read (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async delete(ids: string[]): Promise<void> {
    // One DELETE per object: DeleteObjects needs a Content-MD5, which Web
    // Crypto doesn't offer, and an owner has one image at a time.
    const results = await Promise.all(
      ids.map((id) => this.client.fetch(this.url(id), { method: 'DELETE' })),
    )
    const failed = results.find((res) => !res.ok && res.status !== 404)
    if (failed) throw new Error(`Image store refused a delete (${failed.status})`)
  }
}
