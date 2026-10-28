/** The largest logo or photo the dashboard keeps (inline, as a data URL). */
export const IMAGE_MAX_BYTES = 200 * 1024
export const IMAGE_TOO_LARGE = 'Pick an image under 200 KB'

/** A picked file as a data URL, for an uploaded logo or photo kept in the dummy data. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * A picked logo or photo as a data URL. Refuses one over `IMAGE_MAX_BYTES`
 * before reading it, so a large file is never encoded only to be turned away.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  if (file.size > IMAGE_MAX_BYTES) return Promise.reject(new Error(IMAGE_TOO_LARGE))
  return readAsDataUrl(file)
}
