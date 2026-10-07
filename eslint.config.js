import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Lint is for mistakes (unused values, hooks used wrongly, controls a screen reader cannot
// name), not for style: there is no Prettier here, and formatting is left to the author.
export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'pipeline',
      'public',
      'docs',
      '.claude',
      '.playwright-cli',
      'test-results',
      'playwright-report',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'e2e/**/*.js'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __APP_*__ are filled in by Vite at build time (vite.config.js)
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly', __APP_BUILT__: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The new JSX transform needs no React in scope; props are not type-checked here.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Quotes and apostrophes in text are fine; the rule is typography, not a bug.
      'react/no-unescaped-entities': 'off',
      // Only the two classic rules: the plugin's newer compiler-oriented ones suit code written for it.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Unit tests run under Vitest with globals switched on
    files: ['src/**/*.test.{js,jsx}', 'src/test/**/*.js'],
    languageOptions: { globals: { ...globals.vitest, ...globals.node } },
  },
  {
    // Config and scripts run in Node
    files: ['*.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
]
