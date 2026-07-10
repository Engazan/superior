import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'build/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React-Compiler-era rules that fight this codebase's deliberate idioms:
      // mirror refs (`ref.current = x` each render) keep long-lived event
      // handlers reading fresh state, and effects legitimately set state after
      // async loads. Revisit both if the compiler is ever adopted.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    rules: {
      // `_`-prefixed args/vars are the codebase's intentional-ignore convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  }
)
