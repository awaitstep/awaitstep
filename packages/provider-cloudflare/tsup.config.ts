import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/codegen/generate.ts'],
  format: ['esm', 'cjs'],
  dts: !process.env.NO_DTS,
  clean: true,
  sourcemap: true,
  // `import.meta.url` is how wrangler-exec.ts finds the pinned wrangler.
  // esbuild empties it in the CJS output, so without this shim that build
  // resolves nothing and the deploy paths fail for any CJS consumer.
  shims: true,
})
