// ESLint flat config for the whole workspace.
// Type-aware rules run on every TypeScript file through the TypeScript project service,
// so each .ts/.tsx file must belong to one of the tsconfig files.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Security rule (plan section 4): raw HTML may be written to the page in exactly one place,
// the sanitised diagram component. Everything else is blocked here.
const SANITISED_HTML_COMPONENT = 'apps/web/src/features/viewer/DiagramSvg.tsx';
const rawHtmlSyntax = [
  {
    selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
    message: `Raw HTML is allowed only in ${SANITISED_HTML_COMPONENT}, after DOMPurify.`,
  },
  {
    selector:
      'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
    message: `Raw HTML is allowed only in ${SANITISED_HTML_COMPONENT}, after DOMPurify.`,
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment)$/]',
    message: `Raw HTML is allowed only in ${SANITISED_HTML_COMPONENT}, after DOMPurify.`,
  },
  {
    selector:
      'CallExpression[callee.object.name="document"][callee.property.name=/^(write|writeln)$/]',
    message: `Raw HTML is allowed only in ${SANITISED_HTML_COMPONENT}, after DOMPurify.`,
  },
  {
    selector: 'AssignmentExpression > MemberExpression.left[property.name="srcdoc"]',
    message: `Raw HTML is allowed only in ${SANITISED_HTML_COMPONENT}, after DOMPurify.`,
  },
  {
    selector: 'JSXAttribute[name.name="srcDoc"]',
    message: `Raw HTML is allowed only in ${SANITISED_HTML_COMPONENT}, after DOMPurify.`,
  },
  { selector: 'CallExpression[callee.name="eval"]', message: 'eval is not allowed.' },
  { selector: 'NewExpression[callee.name="Function"]', message: 'new Function is not allowed.' },
];

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/dist-single/**',
    '**/node_modules/**',
    '**/coverage/**',
    'playwright-report/**',
    'test-results/**',
    // The version 2 app and skill, replaced phase by phase (plan section 6)
    'src/**',
    'build.py',
    // Sample projects the skills are tested against, written like the frameworks they imitate
    'skills/fixtures/**',
    '**/*.d.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.cjs', '*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': ['error', ...rawHtmlSyntax],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
    },
  },
  {
    // Plain JavaScript config files are not type-checked
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: [SANITISED_HTML_COMPONENT],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rawHtmlSyntax.filter((rule) => !rule.message.includes('Raw HTML')),
      ],
    },
  },
  {
    // Command-line tools print their report
    files: ['tools/**/*.ts', 'e2e/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
