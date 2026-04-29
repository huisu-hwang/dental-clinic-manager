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
  // Suppress @tailwindcss/postcss in vitest's internal Vite loader.
  // Tailwind v4's postcss plugin uses a string format Vite's PostCSS doesn't accept;
  // tests don't need CSS processing, so we override with empty plugins.
  css: {
    postcss: {
      plugins: [],
    },
  },
})
