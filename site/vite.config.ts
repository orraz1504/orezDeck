/// <reference types="vitest/config" />
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
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
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

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [react(), securityHeaders()],
  build: {
    // Firebase + KaTeX make the main chunk ~1 MB raw (~300 KB gzipped); that's expected.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
