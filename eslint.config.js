import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      'supabase/**',
      'docs/**',
      'research_notes/**',
      'reports/**',
      'apps/mobile/expo-env.d.ts',
      // Throwaway design prototypes: their own tooling, not part of the app.
      'design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Item text can contain household data; logging goes through explicit loggers only.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
);
