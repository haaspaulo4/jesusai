const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        // Jest globals
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        it: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-throw-literal': 'error',
      'eqeqeq': ['warn', 'smart'],
      'no-return-await': 'off', // too noisy for existing codebase
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'no-misleading-character-class': 'warn',
      'no-dupe-keys': 'warn', // TODO: 11 instances to fix (duplicate object keys)
      'no-undef': 'warn', // TODO: ~20 instances of undefined vars to investigate
      'no-case-declarations': 'warn',
      'no-control-regex': 'warn',
      'preserve-caught-error': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'evolution-api/',
      'coverage/',
      'public/',
      'data/',
      'tts-server/',
    ],
  },
];
