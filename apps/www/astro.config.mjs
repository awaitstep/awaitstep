import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  output: 'static',
  site: 'https://awaitstep.dev',
  vite: {
    plugins: [tailwindcss()],
  },
})
