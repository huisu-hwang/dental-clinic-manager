import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 10000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
})
