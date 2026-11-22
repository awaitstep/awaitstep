import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  output: 'static',
  site: 'https://awaitstep.dev',
  // One URL per page, no trailing slash: /integrations builds to integrations.html, and the nav
  // links, canonical tags and sitemap all use the same form.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
  // A Content-Security-Policy <meta> on every page: Astro hashes the page's own scripts, so
  // nothing else can run. Styles allow 'unsafe-inline' because pages set custom properties in
  // style attributes (a drawing's width, the steps' count); every other source is this origin.
  // frame-ancestors cannot go in a <meta>, so framing is refused by X-Frame-Options in _headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "media-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  // Images are transformed once, at build time, into static files in dist/_astro (the site is
  // static, so there is no /_image endpoint and nothing processes images on Cloudflare at request
  // time). Only images in this repository are transformed: no remote domain or pattern is allowed,
  // so a remote URL passed to <Image> or getImage() is never fetched or processed.
  image: {
    domains: [],
    remotePatterns: [],
  },
  // Astro 7 defaults to 'jsx', which drops whitespace around line breaks in
  // markup ("deploy<br>workflows" ran together on mobile). Keep the HTML
  // whitespace rules the page is written for.
  compressHTML: true,
  vite: {
    build: {
      // Astro builds with target 'esnext' and Vite 8 minifies CSS with Lightning CSS, which
      // then drops prefixes Safari < 18 still needs (-webkit-backdrop-filter). Pin the CSS
      // output to Vite's own baseline-widely-available browser set.
      cssTarget: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    },
  },
})
