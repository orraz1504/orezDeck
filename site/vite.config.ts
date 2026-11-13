/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// GitHub Pages serves the site from https://<username>.github.io/<repo-name>/
// Change REPO_NAME if the repository is named differently.
const REPO_NAME = 'orezDeck'
// Must match authDomain in src/firebase.ts (Google sign-in runs in an iframe/popup there).
const AUTH_DOMAIN = 'orezdeck.firebaseapp.com'

/**
 * Content-Security-Policy. GitHub Pages can't send headers, so it's a <meta> tag
 * (which means frame-ancestors / report-uri aren't available).
 * No 'unsafe-eval' and no inline scripts. 'unsafe-inline' is needed for *styles*
 * only: React style attributes and MathLive's injected stylesheets.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "connect-src 'self' https://*.googleapis.com https://apis.google.com",
  `frame-src https://${AUTH_DOMAIN} https://accounts.google.com https://apis.google.com`,
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ')

/** Adds the CSP to production builds only (the dev server needs inline scripts for HMR). */
function securityHeaders(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

/** Files under public/ (paths relative to it), e.g. the manifest, icons and MathLive fonts. */
function publicFiles(dir = 'public'): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? publicFiles(full) : [relative('public', full)]
  })
}

/**
 * Emits sw.js from sw/sw.template.js with the list of files to precache, so the app
 * opens offline. Skips files browsers never use here: KaTeX .woff/.ttf fallbacks and
 * font subsets other than Hebrew / Latin (those still load on demand).
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const keep = (f: string) =>
        !f.endsWith('.map') &&
        !/\.(woff|ttf)$/.test(f) &&
        !(f.endsWith('.woff2') && /(cyrillic|greek|vietnamese)/.test(f)) &&
        f !== 'sw.js'
      const files = [
        'index.html',
        ...Object.keys(bundle).filter(keep),
        ...publicFiles().filter((f) => keep(f) && f !== 'app-icon.png'),
      ]
      const unique = [...new Set(files)].sort()
      const template = readFileSync('sw/sw.template.js', 'utf8')
      const version = createHash('sha256').update(template).update(unique.join('\n')).digest('hex').slice(0, 12)
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(unique, null, 1))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [react(), securityHeaders(), serviceWorker()],
  build: {
    // Firebase + KaTeX make the main chunk ~1 MB raw (~300 KB gzipped); that's expected.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
