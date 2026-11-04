/* eslint-disable @typescript-eslint/no-var-requires */
// Rivela ASE web — TypeScript + React lint, prettier-as-lint (matches root standards).
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier', 'react-refresh'],
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.cjs'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'import/extensions': 'off',
    'import/no-extraneous-dependencies': 'off',
    'react-refresh/only-export-components': 'off',
  },
  settings: {
    'import/resolver': { typescript: { project: './tsconfig.json' } },
  },
};
