import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';

const sharedRules = {
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-debugger': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/next-env.d.ts',
    ],
  },
  // 모든 TS/TSX 파일 공통
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: sharedRules,
  },
  // packages/core 전용 — React/Next 의존성 금지
  {
    files: ['packages/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'core 패키지는 React 의존성을 가질 수 없습니다.' },
            { name: 'react-dom', message: 'core 패키지는 React 의존성을 가질 수 없습니다.' },
          ],
          patterns: [
            {
              group: ['next', 'next/*'],
              message: 'core 패키지는 Next.js 의존성을 가질 수 없습니다.',
            },
            {
              group: ['react/*', 'react-dom/*'],
              message: 'core 패키지는 React 의존성을 가질 수 없습니다.',
            },
          ],
        },
      ],
    },
  },
  // packages/shared 전용 — 모든 프레임워크 의존성 금지
  {
    files: ['packages/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'shared 패키지는 런타임 의존성을 가질 수 없습니다.' },
            { name: 'react-dom', message: 'shared 패키지는 런타임 의존성을 가질 수 없습니다.' },
            {
              name: '@babylonjs/core',
              message: 'shared 패키지는 Babylon 의존성을 가질 수 없습니다.',
            },
          ],
          patterns: [
            {
              group: ['next', 'next/*'],
              message: 'shared 패키지는 Next 의존성을 가질 수 없습니다.',
            },
          ],
        },
      ],
    },
  },
];
