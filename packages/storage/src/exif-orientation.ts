// The one EXIF tag that changes how an image looks: Orientation (0x0112),
// which says the pixels are stored rotated or mirrored. Browsers apply it,
// so stripping EXIF would show a phone's portrait photo sideways. The
// stripper keeps it by writing a new EXIF block that holds only this tag.

const ORIENTATION = 0x0112
const SHORT = 3

/** The "Exif\0\0" a JPEG's APP1 (and some PNG and WebP writers) put before the TIFF data. */
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]

function hasExifHeader(b: Uint8Array): boolean {
  return EXIF_HEADER.every((byte, i) => b[i] === byte)
}

/**
 * The orientation (2–8) an EXIF block's first image directory holds, or
 * null when it holds none, the default (1), or can't be read. `exif` is
 * TIFF data, with or without the "Exif\0\0" header before it.
 */
export function readOrientation(exif: Uint8Array): number | null {
  const tiff = hasExifHeader(exif) ? exif.subarray(EXIF_HEADER.length) : exif
  if (tiff.length < 8) return null
  const order = String.fromCharCode(tiff[0]!, tiff[1]!)
  if (order !== 'II' && order !== 'MM') return null
  const little = order === 'II'
  const u16 = (at: number) =>
    little ? tiff[at]! | (tiff[at + 1]! << 8) : (tiff[at]! << 8) | tiff[at + 1]!
  const u32 = (at: number) => ((u16(little ? at + 2 : at) << 16) | u16(little ? at : at + 2)) >>> 0
  if (u16(2) !== 42) return null
  const ifd = u32(4)
  if (ifd + 2 > tiff.length) return null
  const count = u16(ifd)
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12
    if (entry + 12 > tiff.length) return null
    if (u16(entry) !== ORIENTATION) continue
    if (u16(entry + 2) !== SHORT) return null
    const value = u16(entry + 8)
    return value >= 2 && value <= 8 ? value : null
  }
  return null
}

/** TIFF data holding only an orientation: one directory with one entry. */
export function orientationTiff(orientation: number): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    // Big-endian, 42, the directory at byte 8.
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    // One entry: Orientation, SHORT, count 1, the value; then no next directory.
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
}

/** A JPEG APP1 segment holding only an orientation. */
export function orientationApp1(orientation: number): Uint8Array {
  const tiff = orientationTiff(orientation)
  const length = 2 + EXIF_HEADER.length + tiff.length
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...EXIF_HEADER, ...tiff])
}
