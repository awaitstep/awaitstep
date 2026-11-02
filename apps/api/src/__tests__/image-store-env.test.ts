import { describe, expect, it } from 'vitest'
import { S3ImageStore } from '@awaitstep/storage'
import { imageStoreFromEnv } from '../lib/image-store-env.js'
import { mockDb } from './helpers.js'

// Which store an entry point builds from its environment.

const S3 = {
  IMAGE_STORE: 's3',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'awaitstep',
  S3_ACCESS_KEY_ID: 'minio',
  S3_SECRET_ACCESS_KEY: 'minio-secret',
}

describe('imageStoreFromEnv', () => {
  it('keeps the bytes in the database by default', () => {
    expect(imageStoreFromEnv({}, mockDb).kind).toBe('database')
    expect(imageStoreFromEnv({ IMAGE_STORE: 'db' }, mockDb).kind).toBe('database')
  })

  it('builds the S3 store when asked, with every setting', () => {
    const store = imageStoreFromEnv(S3, mockDb)
    expect(store).toBeInstanceOf(S3ImageStore)
    expect(store.kind).toBe('bucket')
  })

  it('refuses to start with an S3 store missing a setting, naming it', () => {
    expect(() => imageStoreFromEnv({ ...S3, S3_BUCKET: undefined }, mockDb)).toThrow(
      'IMAGE_STORE=s3 needs S3_BUCKET',
    )
  })

  it('refuses a store it does not know', () => {
    expect(() => imageStoreFromEnv({ IMAGE_STORE: 'disk' }, mockDb)).toThrow(
      'IMAGE_STORE must be "db" or "s3", not "disk"',
    )
  })
})
