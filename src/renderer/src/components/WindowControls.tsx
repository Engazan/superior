import { useEffect, useState } from 'react'

function MinimizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <line x1="1.5" y1="5" x2="8.5" y2="5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function MaximizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function RestoreIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="1.5" y="3" width="5.5" height="5.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 3V1.5H8.5V6.5H7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1" />
      <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function WindowControls(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.windowIsMaximized().then(setMaximized)
    return window.api.onWindowMaximizedChange(setMaximized)
  }, [])

  const btn =
    'app-no-drag flex h-full w-11 items-center justify-center text-fgdim transition hover:bg-hover hover:text-fg'

  return (
    <div className="flex items-stretch">
      <button
        className={btn}
        onClick={() => window.api.windowMinimize()}
        aria-label="Minimize"
        title="Minimize"
      >
        <MinimizeIcon />
      </button>
      <button
        className={btn}
        onClick={() => window.api.windowToggleMaximize()}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        className="app-no-drag flex h-full w-11 items-center justify-center text-fgdim transition hover:bg-red-600 hover:text-white"
        onClick={() => window.api.windowClose()}
        aria-label="Close"
        title="Close"
      >
        <CloseIcon />
      </button>
    </div>
  )
}
