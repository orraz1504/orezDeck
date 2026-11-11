import { defineConfig } from 'vitest/config'

// Security Rules tests: run inside `firebase emulators:exec` (see the test:rules script).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
