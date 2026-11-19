/// <reference types="vite/client" />

// Resolved by `extensionsPlugin` (src/extensions/vite-plugin.ts).
declare module 'virtual:awaitstep/extensions' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- an ambient module cannot `import` a relative path
  const extensions: readonly import('./extensions/types').WebExtension[]
  export default extensions
}
