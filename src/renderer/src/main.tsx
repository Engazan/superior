import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme'
import { I18nProvider } from './i18n'
import { ShortcutsProvider } from './shortcuts'
import { AttentionColorProvider } from './attentionColor'
import { UsagePrimaryProvider } from './usagePrimary'
import { ConfirmProvider, ToastProvider, useToast } from './components/ui'
import { ipcErrorInfo } from './ipcError'
import './index.css'

const SPLASH_DURATION_MS = 1000
const SPLASH_FADE_MS = 250

function StartupScreen(): React.JSX.Element {
  const toast = useToast()
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

  // Some UI preference/layout saves are intentionally fire-and-forget. If the
  // disk rejects one, the typed IPC code must still become visible instead of
  // degrading into a console-only unhandled rejection.
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      const info = ipcErrorInfo(event.reason)
      if (info.code !== 'persistence-failed') return
      event.preventDefault()
      toast.error(info.message)
    }
    window.addEventListener('unhandledrejection', onUnhandled)
    return () => window.removeEventListener('unhandledrejection', onUnhandled)
  }, [toast])

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
            <ToastProvider>
              <ConfirmProvider>
                <StartupScreen />
              </ConfirmProvider>
            </ToastProvider>
          </UsagePrimaryProvider>
        </AttentionColorProvider>
      </ShortcutsProvider>
    </ThemeProvider>
  </I18nProvider>
)
