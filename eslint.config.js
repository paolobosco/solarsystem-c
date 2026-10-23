import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Regole dei contratti tra moduli (§ 5.4 di docs/PROGETTO.md).
const MSG_THREE = 'src/time, src/ephem e src/data non importano three (§ 5.4).';
const MSG_DOM = 'src/time e src/ephem non usano il DOM (§ 5.4).';
const MSG_DATE = 'Date, Date.UTC e Intl.DateTimeFormat sono ammessi solo in src/app/clock.ts (§ 5.4).';

const GLOBALI_DOM = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
];

export default defineConfig(
  {
    ignores: [
      'dist/',
      'dist-artifact/',
      'dist-artifact-build/',
      'dist-test*/',
      'node_modules/',
      'public/',
      'scripts/pipeline/',
      'playwright-report/',
      'test-results/',
      'coverage/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Regole con informazioni di tipo (RNF4): promesse non gestite e asserzioni di tipo superflue.
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
  {
    files: ['src/time/**/*.ts', 'src/ephem/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'three', message: MSG_THREE }],
          patterns: [{ group: ['three/*'], message: MSG_THREE }],
        },
      ],
    },
  },
  {
    files: ['src/time/**/*.ts', 'src/ephem/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...GLOBALI_DOM.map((name) => ({ name, message: MSG_DOM }))],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/app/clock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: MSG_DATE },
        { selector: "CallExpression[callee.name='Date']", message: MSG_DATE },
        { selector: "MemberExpression[object.name='Date']", message: MSG_DATE },
        { selector: "MemberExpression[property.name='Date'][object.name=/^(globalThis|window|self)$/]", message: MSG_DATE },
        { selector: "MemberExpression[object.name='Intl'][property.name='DateTimeFormat']", message: MSG_DATE },
        { selector: "TSTypeReference[typeName.name='Date']", message: MSG_DATE },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
