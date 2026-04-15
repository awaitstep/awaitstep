import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Prevent Node-only APIs from leaking into shared code. Only entry files
  // and files explicitly suffixed with -fs are allowed to use node: imports
  // or child_process. This ensures the codebase stays Workers-compatible.
  {
    files: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.ts', 'packages/*/src/**/*.ts'],
    ignores: [
      '**/entry/**',
      '**/*-fs.ts',
      '**/__tests__/**',
      '**/scripts/**',
      'apps/web/src/worker.ts',
      'apps/web/src/lib/cf-context.ts',
      'packages/node-cli/**',
      'packages/provider-cloudflare/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: 'node: imports are only allowed in entry files and *-fs.ts files',
            },
            { group: ['child_process'], message: 'child_process is only allowed in entry files' },
          ],
        },
      ],
    },
  },
)
