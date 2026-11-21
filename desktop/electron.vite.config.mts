import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    define: { __SUPERIOR_RELAY_URL__: JSON.stringify(process.env.SUPERIOR_RELAY_URL || '') },
    resolve: {
      alias: {
        '@shared': resolve(import.meta.dirname, 'src/shared')
      }
    },
    build: {
      // Ship electron-updater inside out/main alongside the main process.
      externalizeDeps: { exclude: ['electron-updater'] },
      rolldownOptions: {
        // The daemon ships as a second Node entry → out/main/daemon.js.
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          daemon: resolve(import.meta.dirname, 'src/daemon/index.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/preload/index.ts'),
          browser: resolve(import.meta.dirname, 'src/preload/browser.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(import.meta.dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve(import.meta.dirname, 'src/shared'),
        '@renderer': resolve(import.meta.dirname, 'src/renderer/src')
      }
    },
    build: {
      minify: 'oxc',
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
