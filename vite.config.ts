import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep license comments (/*! ... */), such as the icons' notice in src/icons.tsx, in the built files.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
