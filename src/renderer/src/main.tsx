import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme'
import { I18nProvider } from './i18n'
import { ShortcutsProvider } from './shortcuts'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

// StrictMode intentionally omitted: its dev-only double-mount would create and
// dispose duplicate xterm instances and can drop the first chunk of pty output.
createRoot(container).render(
  <I18nProvider>
    <ThemeProvider>
      <ShortcutsProvider>
        <App />
      </ShortcutsProvider>
    </ThemeProvider>
  </I18nProvider>
)
