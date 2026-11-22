import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/scenes/index.ts'],
  format: ['esm'],
  dts: !process.env.NO_DTS,
  clean: !options.watch,
  sourcemap: true,
  // three stays an import so each app's bundler splits it into the lazy scene chunk.
  external: [/^three($|\/)/],
}))
