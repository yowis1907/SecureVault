import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['dist', 'coverage'] }, js.configs.recommended, {
  files: ['**/*.{ts,tsx}'],
  extends: [...tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: { 'react-hooks': reactHooks },
  rules: {
    ...reactHooks.configs.recommended.rules,
    // Security guardrails: these mistakes fail the build rather than wait for review.
    'no-console': 'error',
    'no-restricted-properties': [
      'error',
      {
        object: 'Math',
        property: 'random',
        message: 'Use crypto.getRandomValues. Math.random is not cryptographically secure.',
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
        message: 'Raw HTML is forbidden. Vault content must always be rendered as text.',
      },
    ],
  },
});
