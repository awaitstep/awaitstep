import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime-source.ts'],
  format: ['esm'],
  dts: !process.env.NO_DTS,
  clean: true,
  sourcemap: true,
})
