/** Why a page shows the static poster instead of a live scene. */
export type SceneFallbackReason = 'reduced-motion' | 'save-data' | 'low-power' | 'no-webgl2'

export interface SceneSupport {
  ok: boolean
  reason?: SceneFallbackReason
}

interface NavigatorHints {
  connection?: { saveData?: boolean }
  deviceMemory?: number
  hardwareConcurrency?: number
}

/**
 * Whether this browser should run a three.js scene: motion allowed, no data saver, not a
 * low-power device, and a WebGL2 context without a major performance caveat.
 */
export function sceneSupport(win: Window = window): SceneSupport {
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { ok: false, reason: 'reduced-motion' }
  }
  const nav = win.navigator as Navigator & NavigatorHints
  if (nav.connection?.saveData) return { ok: false, reason: 'save-data' }
  if ((nav.deviceMemory ?? 8) < 4 || (nav.hardwareConcurrency ?? 8) < 4) {
    return { ok: false, reason: 'low-power' }
  }
  const probe = win.document.createElement('canvas')
  const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
  if (!gl) return { ok: false, reason: 'no-webgl2' }
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return { ok: true }
}
