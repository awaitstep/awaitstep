import { lazy, useEffect, useState } from 'react'
import type * as MonacoModule from 'monaco-editor'

// The only way into Monaco. `@monaco-editor/loader` takes Monaco from the
// first `init()` call: from a CDN unless `loader.config({ monaco })` came
// first. Every editor and every hook waits here for the bundle, which
// configures the loader as it loads, so the bundled instance is always the
// one in place before anything initialises.

/** The Monaco API as the installed `monaco-editor` types it. */
export type Monaco = typeof MonacoModule

let instance: Monaco | null = null
let loading: Promise<Monaco> | null = null
const NEVER = new Promise<Monaco>(() => {})

/**
 * Loads the bundled Monaco once, client side (the bundle hands itself to
 * the editor wrapper and takes the app's themes and font as it loads).
 * Never settles on the server, where no editor runs.
 */
export function loadMonaco(): Promise<Monaco> {
  if (import.meta.env.SSR || typeof window === 'undefined') return NEVER
  loading ??= import('./bundled-monaco').then(
    ({ monaco: loaded }) => {
      instance = loaded as Monaco
      return instance
    },
    (error: unknown) => {
      // A chunk that failed to load (a deploy replaced it, the network
      // dropped) is asked for again next time, not remembered as failed.
      loading = null
      throw error
    },
  )
  return loading
}

// Start the download as soon as code that uses Monaco loads (as the CDN
// loader did), not when the first editor mounts: the bundle is large, and an
// editor that waits for it shows its empty frame first.
if (!import.meta.env.SSR && typeof window !== 'undefined') loadMonaco().catch(() => {})

/** The bundled Monaco once it has loaded (starting the load), else null. */
export function useMonaco(): Monaco | null {
  const [monaco, setMonaco] = useState<Monaco | null>(instance)
  // Loading is an external, asynchronous source: the effect subscribes to it.
  useEffect(() => {
    if (monaco) return
    let live = true
    loadMonaco().then(
      (loaded) => {
        if (live) setMonaco(loaded)
      },
      // The editors show their own load error; hooks stay without an instance.
      () => {},
    )
    return () => {
      live = false
    }
  }, [monaco])
  return monaco
}

// The server renders the wrapper as it is; the client waits for the bundle first.
const editorModule = () =>
  import.meta.env.SSR
    ? import('@monaco-editor/react')
    : loadMonaco().then(() => import('@monaco-editor/react'))

/** The Monaco editor component, on the bundled instance. */
export const MonacoEditor = lazy(editorModule)

/** The Monaco diff editor component, on the bundled instance. */
export const MonacoDiffEditor = lazy(() =>
  editorModule().then((module) => ({ default: module.DiffEditor })),
)
