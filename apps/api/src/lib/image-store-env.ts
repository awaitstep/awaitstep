import type { DatabaseAdapter } from '@awaitstep/db'
import { S3ImageStore, type ImageStore } from '@awaitstep/storage'
import { databaseImageStore } from './images.js'

/**
 * The image store an entry point's environment asks for. Unset (or `db`),
 * the database keeps the bytes. `IMAGE_STORE=s3` needs the `S3_*` settings
 * of any S3-compatible bucket — R2, S3, GCS in S3 mode, MinIO — and refuses
 * to start without them rather than lose uploads.
 */
export function imageStoreFromEnv(
  env: Record<string, string | undefined>,
  db: DatabaseAdapter,
): ImageStore {
  const kind = env['IMAGE_STORE']?.trim().toLowerCase() || 'db'
  if (kind === 'db') return databaseImageStore(db)
  if (kind !== 's3') throw new Error(`IMAGE_STORE must be "db" or "s3", not "${kind}"`)
  const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
  const missing = required.filter((name) => !env[name])
  if (missing.length > 0) {
    throw new Error(`IMAGE_STORE=s3 needs ${missing.join(', ')}`)
  }
  return new S3ImageStore({
    endpoint: env['S3_ENDPOINT']!,
    bucket: env['S3_BUCKET']!,
    accessKeyId: env['S3_ACCESS_KEY_ID']!,
    secretAccessKey: env['S3_SECRET_ACCESS_KEY']!,
    region: env['S3_REGION'] || undefined,
  })
}
