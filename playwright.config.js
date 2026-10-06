import { defineConfig } from '@playwright/test'

// Browser tests (accessibility). Unit tests are Vitest's, under src/; these live in e2e/.
//   npx playwright test
// They run against the dev server and reuse it if it is already up. The dashboard needs
// data: either a pipeline run in public/data (with .env.local), or the demo dataset.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
