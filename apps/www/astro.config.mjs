import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  output: 'static',
  site: 'https://awaitstep.dev',
  // Astro 7 defaults to 'jsx', which drops whitespace around line breaks in
  // markup ("deploy<br>workflows" ran together on mobile). Keep the HTML
  // whitespace rules the page is written for.
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Astro builds with target 'esnext' and Vite 8 minifies CSS with Lightning CSS, which
      // then drops prefixes Safari < 18 still needs (-webkit-backdrop-filter). Pin the CSS
      // output to Vite's own baseline-widely-available browser set.
      cssTarget: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    },
  },
})
