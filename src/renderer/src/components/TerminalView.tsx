import { useCallback, useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { subscribe } from '../terminalBus'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import { formatChord, useShortcutTitle } from '../shortcuts'
import { PresetIcon } from './PresetIcon'
import { UsageBadge } from './UsageBadge'
import { barTint } from '../tint'
import type { Rect } from '../gridLayout'
import type { AgentSession } from '../types'

const FULL_RECT: Rect = { top: 0, left: 0, width: 100, height: 100 }

const STATUS_DOT: Record<AgentSession['status'], string> = {
  running: 'bg-emerald-400',
  exited: 'bg-zinc-500',
  error: 'bg-red-500'
}

// Older builds could accidentally feed xterm's OSC 10/11 color responses into
// the PTY during attach. Remove only that exact stale response shape while
// replaying historical scrollback; live terminal output is never sanitized.
function sanitizeReplay(data: string): string {
  return data.replace(/(?:10|11);rgb:(?:[0-9a-f]{4}\/){2}[0-9a-f]{4}/gi, '')
}

interface Props {
  session: AgentSession
  /** the cell this terminal occupies, in percentages; defaults to filling the panel */
  rect?: Rect
  /** whether this terminal is shown (vs. kept mounted but hidden) */
  visible: boolean
  /** whether this terminal should grab keyboard focus */
  focused: boolean
  /** show the per-cell topbar above the terminal (grid mode) */
  showBar: boolean
  /** one-based grid position; the first nine cells expose Ctrl+number */
  shortcutNumber?: number
  /** this is the active session (drives bar styling) */
  active: boolean
  /** the cell is blown up to fill the whole panel */
  maximized: boolean
  /** animate position/size changes (maximize/restore, relayout); off while
      dragging a divider so the resize stays crisp */
  animate: boolean
  /** the user picked this session (clicked its body or bar) */
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onToggleMaximize: (id: string) => void
  onExit: (id: string, exitCode: number) => void
}

// Full 16-colour ANSI palettes so program output is colourful and on-theme:
// Catppuccin Mocha for dark, Catppuccin Latte for light.
const TERM_THEMES: Record<'light' | 'dark', ITheme> = {
  dark: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b70',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8'
  },
  light: {
    background: '#ffffff',
    foreground: '#1d1d1f',
    cursor: '#1d1d1f',
    selectionBackground: '#b3d4fc',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#179299',
    brightWhite: '#bcc0cc'
  }
}

export function TerminalView({
  session,
  rect,
  visible,
  focused,
  showBar,
  shortcutNumber,
  active,
  maximized,
  animate,
  onSelect,
  onClose,
  onToggleMaximize,
  onExit
}: Props): JSX.Element {
  const r = rect ?? FULL_RECT
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const replayWritesRef = useRef(0)
  // Last size we told the pty, so we can skip redundant resizes.
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const { resolved } = useTheme()
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()

  // Keep the latest onSelect without re-running the creation effect.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Read current visibility from inside the once-registered ResizeObserver.
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // Measure the terminal and push its size to the pty — but only when it's
  // visible and the size actually changed. A hidden terminal keeps its last
  // size, so toggling visibility on a workspace switch never resizes the pty.
  // That matters because a resize makes the shell/agent redraw its prompt
  // (SIGWINCH), and that redraw is indistinguishable from real output — it would
  // otherwise flip the session to "busy" and pulse a workspace that isn't
  // actually running anything.
  const syncSize = useCallback(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit || !visibleRef.current) return
    try {
      fit.fit()
    } catch {
      return // element not measurable yet
    }
    const last = lastSizeRef.current
    if (last && last.cols === term.cols && last.rows === term.rows) return
    lastSizeRef.current = { cols: term.cols, rows: term.rows }
    window.api.resize(session.id, term.cols, term.rows)
  }, [session.id])

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
    const dataDisposable = term.onData((data) => {
      // Parsing historical OSC queries (notably OSC 10/11 color queries) can
      // make xterm generate terminal responses. Never feed those responses
      // back into the live shell while restoring scrollback.
      if (replayWritesRef.current > 0) return
      window.api.sendInput(session.id, data)
    })

    // pty output / exit -> xterm
    const unsubscribe = subscribe(session.id, {
      onData: (data, replay) => {
        if (!replay) {
          // Follow the tail: pin to the bottom on new output, but only when the
          // user hasn't scrolled up to read history. Checked per-chunk *before*
          // the write so a burst keeps following, yet scrolling up pauses it.
          const buf = term.buffer.active
          const atBottom = buf.viewportY >= buf.baseY
          term.write(data, atBottom ? () => term.scrollToBottom() : undefined)
          return
        }
        const restored = sanitizeReplay(data)
        if (!restored) return
        replayWritesRef.current += 1
        term.write(restored, () => {
          replayWritesRef.current = Math.max(0, replayWritesRef.current - 1)
        })
      },
      onExit: (e) => {
        const dim = '\x1b[2m'
        const reset = '\x1b[0m'
        const note = e.message ? `${e.message}` : `process exited with code ${e.exitCode}`
        term.write(`\r\n${dim}[${note}]${reset}\r\n`)
        onExit(session.id, e.exitCode)
      }
    })

    // Attach to the daemon-owned pty: replays scrollback, then streams live.
    window.api.attach(session.id)

    // tell the pty our real size (no-op while hidden; synced on first show)
    syncSize()

    const ro = new ResizeObserver(() => syncSize())
    ro.observe(host)

    // Clicking into the terminal body focuses xterm's textarea; report it up so
    // the active-session highlight follows the click, not just the chrome label.
    const onFocusIn = (): void => onSelectRef.current(session.id)
    host.addEventListener('focusin', onFocusIn)

    return () => {
      window.api.detach(session.id)
      ro.disconnect()
      host.removeEventListener('focusin', onFocusIn)
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

  // Refit whenever this view becomes visible or its cell changes size. syncSize
  // skips the pty resize when the measured size is unchanged, so simply becoming
  // visible (same size as when it was hidden) never provokes a redraw.
  useEffect(() => {
    if (!visible) return
    // next tick so the container has its final (visible) dimensions
    const t = window.setTimeout(syncSize, 0)
    return () => window.clearTimeout(t)
  }, [visible, r.top, r.left, r.width, r.height, syncSize])

  // Grab keyboard focus when this becomes the focused terminal.
  useEffect(() => {
    if (!focused) return
    const term = termRef.current
    if (!term) return
    const t = window.setTimeout(() => {
      try {
        term.focus()
      } catch {
        /* ignore */
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [focused, session.id])

  // highlight the focused cell only when a topbar is shown (grid mode);
  // in tabs mode a single terminal is always focused, so a border would be noise
  const highlight = focused && showBar

  return (
    <div
      className={`absolute ${
        animate
          ? 'transition-[top,left,width,height,opacity] duration-200 ease-out'
          : 'transition-opacity'
      } ${
        visible
          ? // lift the active cell above the grid dividers (z-20) so its highlight
            // ring isn't clipped by the divider lines on the shared edges
            highlight
            ? 'z-30 opacity-100'
            : 'z-10 opacity-100'
          : 'pointer-events-none z-0 opacity-0'
      }`}
      style={{
        top: `${r.top}%`,
        left: `${r.left}%`,
        width: `${r.width}%`,
        height: `${r.height}%`
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{ backgroundColor: TERM_THEMES[resolved].background }}
      >
        {/* Active-cell highlight, drawn above the terminal content so it stays visible. */}
        {highlight && (
          <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-sky-500" />
        )}
        {/* Always-visible topbar; the terminal sits below it, never behind it. */}
        {showBar && (
          <div
            onClick={() => onSelect(session.id)}
            style={barTint(session.color, active)}
            className={`flex shrink-0 cursor-pointer items-center gap-2 border-b border-edge px-2 py-1 text-xs ${
              active ? 'bg-bar text-fg' : 'bg-bar/80 text-fgdim'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[session.status]}`} />
            <PresetIcon
              iconType={session.iconType}
              icon={session.icon}
              className="h-4 w-4 text-sm"
            />
            <span className="min-w-0 flex-1 truncate">{session.label}</span>
            <UsageBadge sessionId={session.id} />
            {shortcutNumber !== undefined && shortcutNumber <= 9 && (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide ${
                  active
                    ? 'border-accentBorder bg-accentBg text-accent'
                    : 'border-edge bg-panel/50 text-fgmuted'
                }`}
                title={`Focus terminal ${shortcutNumber}`}
              >
                {formatChord(`ctrl+${shortcutNumber}`)}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleMaximize(session.id)
              }}
              className="shrink-0 text-fgmuted transition hover:text-fg"
              aria-label={maximized ? t('terminal.restore') : t('terminal.maximize')}
              title={shortcutTitle(
                maximized ? t('terminal.restore') : t('terminal.maximize'),
                'maximizeFocusedCell'
              )}
            >
              {maximized ? (
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9.5 6.5h-3v3M6.5 6.5L10 10M6.5 9.5L3 13M13 3l-3.5 3.5" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose(session.id)
              }}
              className="shrink-0 text-fgmuted transition hover:text-fg"
              aria-label={t('terminal.closeSession')}
              title={shortcutTitle(t('terminal.stopClose'), 'closeFocusedCell')}
            >
              ✕
            </button>
          </div>
        )}
        <div ref={hostRef} className="min-h-0 w-full flex-1" />
      </div>
    </div>
  )
}
