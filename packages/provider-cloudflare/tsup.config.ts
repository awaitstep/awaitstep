import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/codegen/generate.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
