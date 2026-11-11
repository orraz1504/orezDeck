/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the site from https://<username>.github.io/<repo-name>/
// Change REPO_NAME if the repository is named differently.
const REPO_NAME = 'orezDeck'

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [react()],
  build: {
    // Firebase + KaTeX make the main chunk ~1 MB raw (~300 KB gzipped); that's expected.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
