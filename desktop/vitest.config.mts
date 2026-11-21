import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // addon-ligatures 0.10 ships its ESM entry but omits the declared CJS entry.
      '@xterm/addon-ligatures': resolve(import.meta.dirname, 'node_modules/@xterm/addon-ligatures/lib/addon-ligatures.mjs'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@renderer': resolve(import.meta.dirname, 'src/renderer/src')
    }
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts']
    }
  }
})
