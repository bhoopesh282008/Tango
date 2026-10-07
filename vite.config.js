import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { contentSecurityPolicy } from './scripts/csp.mjs'

const pkg =JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Which build is this? Shown in the footer, so "I saw it on the dashboard" can be pinned to a commit.
function commit() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown' // built from a source archive, without git
  }
}

// The policy goes into the built page only: the dev server's hot reload runs an inline script
// that the policy would block.
const securityPolicy = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy }, injectTo: 'head-prepend' },
  ],
}

export default defineConfig({
  // Where the site is served from on its host: '/' normally, '/Tango/' on GitHub Pages
  // (npm run deploy:pages sets it). Paths to files in public/ go through src/config/assets.js.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), securityPolicy],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
    __APP_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  // MapLibre's worker is an ES module
  worker: { format: 'es' },
  test: {
    // Unit tests only (the app's, and the deploy script's); the browser tests in e2e/ are Playwright's
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.mjs'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    // Tests run on the bundled demo data whatever a local .env file selects.
    env: { VITE_DATA_URL: '', VITE_API_BASE_URL: '' },
  },
})
