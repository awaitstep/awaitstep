import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/codegen/generate.ts'],
  format: ['esm', 'cjs'],
  dts: !process.env.NO_DTS,
  clean: true,
  sourcemap: true,
})
