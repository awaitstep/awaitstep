import type { ImageStore, ImageType } from './image-store.js'

/** A bucket held in memory, for tests: behaves as object storage beside the rows. */
export class MemoryImageStore implements ImageStore {
  readonly kind = 'bucket'
  readonly objects = new Map<string, { bytes: Uint8Array; type: ImageType }>()

  async put(id: string, bytes: Uint8Array, type: ImageType): Promise<void> {
    this.objects.set(id, { bytes: bytes.slice(), type })
  }

  async get(id: string): Promise<Uint8Array | null> {
    return this.objects.get(id)?.bytes.slice() ?? null
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) this.objects.delete(id)
  }
}
