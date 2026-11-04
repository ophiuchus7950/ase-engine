/* eslint-disable @typescript-eslint/no-var-requires */
// Airbnb TypeScript base + @typescript-eslint/recommended + prettier-as-lint (ase_coding_standards.md §1)
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.js', '*.cjs', 'vitest.config.ts', 'web'],
  rules: {
    // Standards §1: `any` is banned
    '@typescript-eslint/no-explicit-any': 'error',
    // Pragmatic relaxations for a worker-heavy pipeline codebase:
    'no-console': 'off', // workers log to stdout
    'import/prefer-default-export': 'off', // named exports only
    '@typescript-eslint/no-use-before-define': 'off',
    'no-await-in-loop': 'off', // poll loops + sequential per-item processing are intentional
    'no-restricted-syntax': 'off', // allow for...of
    'no-continue': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      { devDependencies: ['**/*.test.ts', '**/*.spec.ts', 'vitest.config.ts', 'db/migrate.ts', 'db/seed.ts'] },
    ],
  },
};
