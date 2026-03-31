import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: !process.env.NO_DTS,
  clean: true,
  sourcemap: true,
})
