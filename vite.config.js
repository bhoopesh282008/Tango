import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // MapLibre's worker is an ES module
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    // Tests run on the bundled demo data whatever a local .env file selects.
    env: { VITE_DATA_URL: '', VITE_API_BASE_URL: '' },
  },
})
