import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules', '.data', 'uploads'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Layering (PLAN-B-01 section 3): routes call services rather than the database layer. Three simple lookups
    // still read models directly; they are warnings until they move into services.
    files: ['src/routes/**/*.js'],
    rules: { 'no-restricted-imports': ['warn', { patterns: [{ group: ['**/models.js'], message: 'Routes should call services; move this query into a service.' }] }] },
  },
]
