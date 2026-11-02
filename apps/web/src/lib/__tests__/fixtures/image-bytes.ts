// The first bytes of each image type the API stores, then filler: what the
// picker reads to learn a file's real type.
export const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])
export const JPEG_SIGNATURE = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
])
export const WEBP_SIGNATURE = new TextEncoder().encode('RIFF\x04\0\0\0WEBP')
export const GIF_SIGNATURE = new TextEncoder().encode('GIF89a\x01\0\x01\0\0\0')
export const PDF_SIGNATURE = new TextEncoder().encode('%PDF-1.7\n')
