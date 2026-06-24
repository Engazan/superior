import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme'
import { I18nProvider } from './i18n'
import { ShortcutsProvider } from './shortcuts'
import { AttentionColorProvider } from './attentionColor'
import { UsagePrimaryProvider } from './usagePrimary'
import './index.css'

const SPLASH_DURATION_MS = 1000
const SPLASH_FADE_MS = 250

function StartupScreen(): JSX.Element {
  const [appReady, setAppReady] = useState(false)
  const [splashVisible, setSplashVisible] = useState(true)

  useEffect(() => {
    const startApp = window.setTimeout(() => setAppReady(true), SPLASH_DURATION_MS)
    const removeSplash = window.setTimeout(
      () => setSplashVisible(false),
      SPLASH_DURATION_MS + SPLASH_FADE_MS
    )

    return () => {
      window.clearTimeout(startApp)
      window.clearTimeout(removeSplash)
    }
  }, [])

  return (
    <>
      {appReady && <App />}
      {splashVisible && (
        <div
          className={`startup-splash app-drag ${appReady ? 'startup-splash--leaving' : ''}`}
          role="status"
          aria-label="Superior is loading"
        >
          <div className="startup-splash__content">
            <div className="startup-splash__brand">SUPERIOR</div>
            <div className="startup-splash__loader" aria-hidden="true" />
          </div>
        </div>
      )}
    </>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

// StrictMode intentionally omitted: its dev-only double-mount would create and
// dispose duplicate xterm instances and can drop the first chunk of pty output.
createRoot(container).render(
  <I18nProvider>
    <ThemeProvider>
      <ShortcutsProvider>
        <AttentionColorProvider>
          <UsagePrimaryProvider>
            <StartupScreen />
          </UsagePrimaryProvider>
        </AttentionColorProvider>
      </ShortcutsProvider>
    </ThemeProvider>
  </I18nProvider>
)
