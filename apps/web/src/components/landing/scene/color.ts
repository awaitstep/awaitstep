/** Reads a custom property from `el` and resolves it to sRGB 0..1, through a 1px canvas. */
export function readColor(el: Element, name: string): [number, number, number] {
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  if (!value) throw new Error(`missing colour token ${name}`)
  return resolveCssColor(value)
}

let probe: CanvasRenderingContext2D | null = null

/** Any CSS colour (oklch included) as sRGB 0..1, as the browser paints it. */
export function resolveCssColor(value: string): [number, number, number] {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!probe) throw new Error('2d canvas unavailable')
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = value
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}
