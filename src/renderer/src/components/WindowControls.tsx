import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

function MinimizeIcon(): JSX.Element {
  return (
    <svg
      className="block h-3 w-3 -translate-y-px"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function MaximizeIcon(): JSX.Element {
  return (
    <svg
      className="block h-3 w-3 -translate-y-px"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <rect x="2" y="2" width="8" height="8" rx=".5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function RestoreIcon(): JSX.Element {
  return (
    <svg
      className="block h-3 w-3 -translate-y-px"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <rect x="1.75" y="4" width="6.25" height="6.25" rx=".5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4V1.75h6.25V8H8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      className="block h-3 w-3 -translate-y-px"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="m2.5 2.5 7 7m0-7-7 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WindowControls(): JSX.Element {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.windowIsMaximized().then(setMaximized)
    return window.api.onWindowMaximizedChange(setMaximized)
  }, [])

  const btn =
    'app-no-drag grid h-full w-10 place-items-center p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'

  return (
    <div className="flex h-full items-stretch">
      <button
        className={btn}
        onClick={() => window.api.windowMinimize()}
        aria-label={t('window.minimize')}
        title={t('window.minimize')}
      >
        <MinimizeIcon />
      </button>
      <button
        className={btn}
        onClick={() => window.api.windowToggleMaximize()}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        title={maximized ? t('window.restore') : t('window.maximize')}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        className="app-no-drag grid h-full w-10 place-items-center p-0 text-fgdim transition hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300"
        onClick={() => window.api.windowClose()}
        aria-label={t('window.close')}
        title={t('window.close')}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
