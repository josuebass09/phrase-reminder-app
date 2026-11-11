import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The commit being built, from Railway, for the admin to tell which version each part runs.
  define: { __APP_VERSION__: JSON.stringify(process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || null) },
  build: {
    // Keep license comments (/*! ... */), such as the icons' notice in src/icons.tsx, in the built files.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
