export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function linearToSrgb(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1
  const t = raw.trim()
  return clamp01(t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t))
}

/** Parses the colour syntaxes the app's tokens use: `oklch()` and `#rgb[a]`/`#rrggbb[aa]`. */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase()

  const oklch =
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(value)
  if (oklch) {
    const L = oklch[1].endsWith('%') ? parseFloat(oklch[1]) / 100 : parseFloat(oklch[1])
    const C = parseFloat(oklch[2])
    const h = (parseFloat(oklch[3]) * Math.PI) / 180
    const a = C * Math.cos(h)
    const b = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return {
      r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      a: parseAlpha(oklch[4]),
    }
  }

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)
  if (hex) {
    let h = hex[1]
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    const byte = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? byte(6) : 1 }
  }
  return null
}

/** `#rrggbb`, or `#rrggbbaa` when translucent — the forms Monaco accepts. */
export function toHex({ r, g, b, a }: Rgba): string {
  const part = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}${a < 1 ? part(a) : ''}`
}

/** Lays a translucent colour over an opaque one. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG 2.x contrast ratio of two opaque colours. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
