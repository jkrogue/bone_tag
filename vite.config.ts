import react from '@vitejs/plugin-react'
import { defineConfig, configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // `e2e/**` holds Playwright specs, not Vitest ones — Playwright's own
    // config/runner picks those up instead.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
