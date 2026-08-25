import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/prisma/migrations/**',
      // Expo build output and the generated native projects — none of it is ours to lint.
      '**/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript already checks for undefined identifiers; the core rule only
      // produces false positives on Node/DOM globals under flat config.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // The React rules apply to the two frontends. Scoped rather than global so the API and
    // shared-types are not linted against hook rules they can never break.
    files: ['apps/admin-web/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // A conditional hook call is a crash, not a style issue.
      'react-hooks/rules-of-hooks': 'error',
      // A warning, not an error: several effects here deliberately omit deps (loader refs,
      // one-shot bootstraps) and each of those omissions is commented at the call site.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Metro and Babel read their config through CommonJS `require`, so these two files cannot
    // be ES modules however the rest of the repo is written.
    files: ['apps/mobile/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
