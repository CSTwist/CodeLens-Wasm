import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'public/wasm', 'node_modules'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        self: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        process: 'readonly',
        MessageEvent: 'readonly',
        Worker: 'readonly',
        URL: 'readonly',
      },
    },
  }
)
