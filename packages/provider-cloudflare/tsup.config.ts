import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/codegen/generate.ts'],
  format: ['esm'],
  dts: !process.env.NO_DTS,
  // Watch rebuilds run beside the app dev servers; cleaning dist here
  // makes them import a missing module at startup.
  clean: !options.watch,
  sourcemap: true,
}))
