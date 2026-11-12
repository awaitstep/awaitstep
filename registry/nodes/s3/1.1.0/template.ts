import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3'

export default async function (ctx) {
  const client = new S3Client({
    region: ctx.config.region ?? 'us-east-1',
    credentials: {
      accessKeyId: ctx.env.S3_ACCESS_KEY_ID,
      secretAccessKey: ctx.env.S3_SECRET_ACCESS_KEY,
    },
    ...(ctx.env.S3_ENDPOINT ? { endpoint: ctx.env.S3_ENDPOINT, forcePathStyle: true } : {}),
  })
  const action = ctx.config.action

  switch (action) {
    case 'Put Object': {
      const result = await client.send(
        new PutObjectCommand({
          Bucket: ctx.config.bucket,
          Key: ctx.config.key,
          Body: ctx.config.body,
          ContentType: ctx.config.contentType ?? 'application/octet-stream',
        }),
      )
      return { key: String(ctx.config.key ?? ''), data: result, count: 0 }
    }

    case 'Get Object': {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: ctx.config.bucket,
          Key: ctx.config.key,
        }),
      )
      const body = await result.Body?.transformToString()
      return {
        key: String(ctx.config.key ?? ''),
        data: { body, contentType: result.ContentType, contentLength: result.ContentLength },
        count: 0,
      }
    }

    case 'List Objects': {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: ctx.config.bucket,
          Prefix: ctx.config.prefix,
          MaxKeys: ctx.config.maxKeys ?? 1000,
        }),
      )
      const objects = (result.Contents ?? []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified?.toISOString(),
      }))
      return { key: String(ctx.config.prefix ?? ''), data: { objects }, count: objects.length }
    }

    case 'Delete Object': {
      const result = await client.send(
        new DeleteObjectCommand({
          Bucket: ctx.config.bucket,
          Key: ctx.config.key,
        }),
      )
      return { key: String(ctx.config.key ?? ''), data: result, count: 0 }
    }

    case 'Head Object': {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: ctx.config.bucket,
          Key: ctx.config.key,
        }),
      )
      return { key: String(ctx.config.key ?? ''), data: result, count: 0 }
    }

    case 'Copy Object': {
      if (!ctx.config.destinationKey) {
        throw new Error('Destination Key is required for Copy Object')
      }
      const result = await client.send(
        new CopyObjectCommand({
          Bucket: ctx.config.bucket,
          Key: ctx.config.destinationKey,
          CopySource: `${ctx.config.bucket}/${ctx.config.key}`,
        }),
      )
      return { key: String(ctx.config.destinationKey), data: result, count: 0 }
    }

    case 'List Buckets': {
      const result = await client.send(new ListBucketsCommand({}))
      return {
        key: '',
        data: { buckets: (result.Buckets ?? []).map((bucket) => bucket.Name) },
        count: result.Buckets?.length ?? 0,
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
