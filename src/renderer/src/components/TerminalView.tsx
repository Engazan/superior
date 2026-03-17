import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { subscribe } from '../terminalBus'
import { useTheme } from '../theme'
import type { AgentSession } from '../types'

interface Props {
  session: AgentSession
  active: boolean
  onExit: (id: string, exitCode: number) => void
}

const TERM_THEMES: Record<'light' | 'dark', ITheme> = {
  dark: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b70'
  },
  light: {
    background: '#ffffff',
    foreground: '#1d1d1f',
    cursor: '#1d1d1f',
    selectionBackground: '#b3d4fc'
  }
}

export function TerminalView({ session, active, onExit }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { resolved } = useTheme()

  // Create the xterm instance once per session id and wire it to the bus + pty.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: TERM_THEMES[resolved],
      scrollback: 10_000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    // user keystrokes -> pty
    const dataDisposable = term.onData((data) => window.api.sendInput(session.id, data))

    // pty output / exit -> xterm
    const unsubscribe = subscribe(session.id, {
      onData: (data) => term.write(data),
      onExit: (e) => {
        const dim = '\x1b[2m'
        const reset = '\x1b[0m'
        const note = e.message ? `${e.message}` : `process exited with code ${e.exitCode}`
        term.write(`\r\n${dim}[${note}]${reset}\r\n`)
        onExit(session.id, e.exitCode)
      }
    })

    // tell the pty our real size
    window.api.resize(session.id, term.cols, term.rows)

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        window.api.resize(session.id, term.cols, term.rows)
      } catch {
        /* element not measurable yet */
      }
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      unsubscribe()
      dataDisposable.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // session.id is stable for the life of this component (keyed by it upstream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Recolor an existing terminal when the theme changes (without recreating it).
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = TERM_THEMES[resolved]
  }, [resolved])

  // Refit + focus whenever this view becomes the active tab.
  useEffect(() => {
    if (!active) return
    const fit = fitRef.current
    const term = termRef.current
    if (!fit || !term) return
    // next tick so the container has its final (visible) dimensions
    const t = window.setTimeout(() => {
      try {
        fit.fit()
        window.api.resize(session.id, term.cols, term.rows)
        term.focus()
      } catch {
        /* ignore */
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [active, session.id])

  return (
    <div
      className={`absolute inset-0 p-2 transition-opacity ${
        active ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
      }`}
    >
      <div ref={hostRef} className="h-full w-full" />
    </div>
  )
}
