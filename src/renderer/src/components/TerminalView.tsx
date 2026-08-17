import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { subscribe } from '../terminalBus'
import { registerSearch, unregisterSearch } from '../terminalSearch'
import { registerFileLinkProvider } from '../terminalLinks'
import { formatPathForPrompt } from '../terminalInput'
import { useAttentionSessions, useBusySessions } from '../activityStore'
import { useAttentionColor } from '../attentionColor'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import { formatChord, useShortcutTitle } from '../shortcuts'
import { PresetIcon } from './PresetIcon'
import { CloseIcon, IconButton, PencilIcon, RestartIcon, useToast } from './ui'
import { UsageBadge } from './UsageBadge'
import { barTint } from '../tint'
import type { Rect } from '../gridLayout'
import type { AgentSession, FileLinkTarget } from '../types'

const FULL_RECT: Rect = { top: 0, left: 0, width: 100, height: 100 }
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024

const STATUS_DOT: Record<AgentSession['status'], string> = {
  running: 'bg-status',
  exited: 'bg-fgmuted',
  error: 'bg-dangerSolid'
}

/**
 * Per-cell status dot: layers live activity on top of the process state so a
 * glance tells *which* terminal is streaming output (pulsing green), which one
 * finished and awaits input (attention color), and which merely runs idle.
 * A separate subscriber component so busy churn re-renders only the dot.
 */
function CellStatusDot({ session }: { session: AgentSession }): React.JSX.Element {
  const { t } = useI18n()
  const busy = useBusySessions()
  const attention = useAttentionSessions()
  const { attentionColor } = useAttentionColor()
  if (session.status === 'running' && attention.has(session.id)) {
    return (
      <span
        className="h-2 w-2 shrink-0 animate-pulse rounded-full"
        style={{ backgroundColor: attentionColor }}
        title={t('terminal.statusFinished')}
      />
    )
  }
  const isBusy = session.status === 'running' && busy.has(session.id)
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${isBusy ? 'animate-pulse' : ''} ${STATUS_DOT[session.status]}`}
      title={
        isBusy
          ? t('terminal.statusWorking')
          : session.status === 'error'
            ? t('terminal.statusError')
            : undefined
      }
    />
  )
}

// Older builds could accidentally feed xterm's OSC 10/11 color responses into
// the PTY during attach. Remove only that exact stale response shape while
// replaying historical scrollback; live terminal output is never sanitized.
function sanitizeReplay(data: string): string {
  return data.replace(/(?:10|11);rgb:(?:[0-9a-f]{4}\/){2}[0-9a-f]{4}/gi, '')
}

interface Props {
  session: AgentSession
  /** working dir file-path links resolve against (the workspace's effective dir) */
  workingDir?: string | null
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
  /** open a terminal file link in Superior's built-in preview editor */
  onOpenFileTarget: (target: FileLinkTarget) => void
  onClose: (id: string) => void
  /** re-run the session's original preset command in place */
  onRestart: (id: string) => Promise<void>
  /** set this terminal's user nickname (persisted); empty string clears it */
  onSetNickname: (id: string, nickname: string) => void
  onToggleMaximize: (id: string) => void
  onExit: (id: string, exitCode: number | null) => void
}

// Full 16-colour ANSI palettes so program output is colourful and on-theme:
// Catppuccin-derived ANSI palettes, paired with the app's dark/light surfaces.
const TERM_THEMES: Record<'light' | 'dark', ITheme> = {
  dark: {
    background: '#12171f',
    foreground: '#e6ebf2',
    cursor: '#f08a72',
    selectionBackground: '#344052',
    black: '#6b7687',
    red: '#ff7f88',
    green: '#7bd39b',
    yellow: '#e8bf73',
    blue: '#83adff',
    magenta: '#d1a2f4',
    cyan: '#6bcbd3',
    white: '#cbd3df',
    brightBlack: '#8c97a8',
    brightRed: '#ff9aa1',
    brightGreen: '#98e0b0',
    brightYellow: '#f2d18f',
    brightBlue: '#a2c1ff',
    brightMagenta: '#dfb9f8',
    brightCyan: '#8bdce1',
    brightWhite: '#f4f7fb'
  },
  light: {
    background: '#ffffff',
    foreground: '#202633',
    cursor: '#bd5845',
    selectionBackground: '#f5d6cf',
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

// Memoized with rects compared by value (the grid rebuilds them each render):
// every terminal stays mounted across workspace/tab switches, so without this
// each App render re-runs the render of every terminal in every workspace.
function rectEqual(a?: Rect, b?: Rect): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function propsEqual(prev: Props, next: Props): boolean {
  return (
    prev.session === next.session &&
    prev.workingDir === next.workingDir &&
    rectEqual(prev.rect, next.rect) &&
    prev.visible === next.visible &&
    prev.focused === next.focused &&
    prev.showBar === next.showBar &&
    prev.shortcutNumber === next.shortcutNumber &&
    prev.active === next.active &&
    prev.maximized === next.maximized &&
    prev.animate === next.animate &&
    prev.onSelect === next.onSelect &&
    prev.onOpenFileTarget === next.onOpenFileTarget &&
    prev.onClose === next.onClose &&
    prev.onRestart === next.onRestart &&
    prev.onSetNickname === next.onSetNickname &&
    prev.onToggleMaximize === next.onToggleMaximize &&
    prev.onExit === next.onExit
  )
}

export const TerminalView = memo(function TerminalView({
  session,
  workingDir,
  rect,
  visible,
  focused,
  showBar,
  shortcutNumber,
  active,
  maximized,
  animate,
  onSelect,
  onOpenFileTarget,
  onClose,
  onRestart,
  onSetNickname,
  onToggleMaximize,
  onExit
}: Props): React.JSX.Element {
  const r = rect ?? FULL_RECT
  const flushRight = r.left + r.width >= 99.999
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

  const onOpenFileTargetRef = useRef(onOpenFileTarget)
  onOpenFileTargetRef.current = onOpenFileTarget

  // Live cwd + toast for the file-link provider (registered once per session).
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  // Read the translator at paste time so a language switch mid-session is
  // reflected in the toast, without re-running the once-per-session effect.
  const tRef = useRef(t)
  tRef.current = t
  const workingDirRef = useRef<string | null>(workingDir ?? null)
  workingDirRef.current = workingDir ?? null

  // Same for onRestart, since the keystroke handler is wired once per session id.
  const onRestartRef = useRef(onRestart)
  onRestartRef.current = onRestart

  // True once the pty has exited: keystrokes then drive "press Enter to restart"
  // instead of being fed to a dead pty. Seeded from the mount-time status so a
  // session restored already-dead (app relaunch) still restarts on Enter.
  const exitedRef = useRef(session.status !== 'running')
  // Restart in flight — blocks duplicate Enter-restarts. exitedRef itself stays
  // true across the attempt: success swaps in a new session id (this view
  // remounts), so still being mounted means the restart failed and the cell
  // must stay restartable instead of streaming keys to a dead id.
  const restartingRef = useRef(false)

  // Localized "press Enter to restart" hint, read at exit time so a language
  // switch before the process dies is reflected.
  const restartHintRef = useRef('')
  restartHintRef.current = t('terminal.restartHint')

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
    if (exitedRef.current) return
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
      scrollback: 10_000,
      // FitAddon subtracts this value from usable terminal width. Keep just a
      // 1px calculation reserve; the CSS scrollbar below overlays the content
      // instead of leaving xterm's default 14px empty gutter.
      overviewRuler: { width: 1 }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Scrollback search, driven by the App-owned overlay via the registry —
    // no props change, so the memoization contract stays intact.
    const search = new SearchAddon()
    term.loadAddon(search)
    registerSearch(session.id, search, term)
    // mod+click on a file path in the output opens it in the configured editor.
    const fileLinks = registerFileLinkProvider(term, {
      getCwd: () => workingDirRef.current,
      onOpenInApp: (target) => onOpenFileTargetRef.current(target),
      onOpenError: (message) => toastRef.current.error(message)
    })
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
      // After exit the pty is gone; Enter re-runs the original command instead of
      // sending dead input. Any other key is swallowed so the corpse stays quiet.
      if (exitedRef.current) {
        if (data.includes('\r') && !restartingRef.current) {
          restartingRef.current = true
          void Promise.resolve(onRestartRef.current(session.id)).finally(() => {
            restartingRef.current = false
          })
        }
        return
      }
      window.api.sendInput(session.id, data)
    })

    // Image paste: xterm's built-in paste is text-only, so a clipboard image
    // (screenshot, copied picture) would otherwise be dropped and never reach
    // the agent — unlike a native terminal, where the agent reads the OS
    // clipboard itself. We intercept in the capture phase (before xterm's own
    // textarea handler), persist the bytes to a temp file, and insert its path
    // so Claude/Codex can read it, exactly like a drag-and-dropped file.
    const onPaste = (e: ClipboardEvent): void => {
      if (exitedRef.current) return
      const items = e.clipboardData?.items
      if (!items) return
      const item = Array.from(items).find(
        (it) => it.kind === 'file' && it.type.startsWith('image/')
      )
      const imageFile = item?.getAsFile()
      if (!imageFile) return // plain-text paste — let xterm handle it
      e.preventDefault()
      e.stopPropagation()
      if (imageFile.size > MAX_PASTED_IMAGE_BYTES) {
        toastRef.current.error(tRef.current('terminal.imagePasteFailed'))
        return
      }
      const ext = imageFile.type.split('/')[1]?.split('+')[0] || 'png'
      imageFile
        .arrayBuffer()
        .then((buf) => window.api.saveClipboardImage(new Uint8Array(buf), ext))
        .then(({ path }) => {
          window.api.sendInput(session.id, formatPathForPrompt(path))
          toastRef.current.success(tRef.current('terminal.imagePasted'))
        })
        .catch((err) => {
          console.error('[paste] image save failed:', err)
          toastRef.current.error(tRef.current('terminal.imagePasteFailed'))
        })
    }
    host.addEventListener('paste', onPaste, true)

    let attached = false
    let unsubscribe = (): void => {}
    if (session.status === 'running') {
      // pty output / exit -> xterm
      unsubscribe = subscribe(session.id, {
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
          // Localized like the exited chip; read through the ref so a language
          // switched after mount is reflected at exit time.
          const note =
            e.message ?? tRef.current('terminal.exitedChip', { code: String(e.exitCode) })
          exitedRef.current = true
          term.write(`\r\n${dim}[${note}]${reset}\r\n${dim}[${restartHintRef.current}]${reset}\r\n`)
          onExit(session.id, e.exitCode)
        }
      })

      // Attach to the daemon-owned pty: replays scrollback, then streams live.
      attached = true
      window.api.attach(session.id)
    } else {
      const dim = '\x1b[2m'
      const reset = '\x1b[0m'
      const note =
        session.exitCode == null
          ? t('terminal.notRunningChip')
          : t('terminal.exitedChip', { code: String(session.exitCode) })
      term.write(`${dim}[${note}]${reset}\r\n${dim}[${restartHintRef.current}]${reset}\r\n`)
    }

    // tell the pty our real size (no-op while hidden; synced on first show)
    syncSize()

    // Coalesce resize bursts (window resize, divider drag) to one fit per frame —
    // fit() measures the DOM and reflows xterm, too heavy to run per observation.
    let raf: number | null = null
    const ro = new ResizeObserver(() => {
      if (raf !== null) return
      raf = requestAnimationFrame(() => {
        raf = null
        syncSize()
      })
    })
    ro.observe(host)

    // Clicking into the terminal body focuses xterm's textarea; report it up so
    // the active-session highlight follows the click, not just the chrome label.
    const onFocusIn = (): void => onSelectRef.current(session.id)
    host.addEventListener('focusin', onFocusIn)

    return () => {
      if (attached) window.api.detach(session.id)
      ro.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
      host.removeEventListener('focusin', onFocusIn)
      host.removeEventListener('paste', onPaste, true)
      unsubscribe()
      unregisterSearch(session.id)
      fileLinks.dispose()
      dataDisposable.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // session.id is stable for the life of this component (keyed by it upstream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Also apply the compact scrollbar width to a live terminal after a renderer
  // hot reload. New terminals receive it in the constructor above; this keeps
  // an already-open dev session from retaining the old 14px FitAddon gutter.
  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.overviewRuler = { width: 1 }
    syncSize()
  }, [syncSize])

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

  // Inline nickname editor: whether the name is being edited and its draft text.
  const [editingNick, setEditingNick] = useState(false)
  const [nickDraft, setNickDraft] = useState('')

  const openNickEditor = (): void => {
    setNickDraft(session.nickname ?? '')
    setEditingNick(true)
  }
  const commitNick = (): void => {
    setEditingNick(false)
    const next = nickDraft.trim()
    if (next !== (session.nickname ?? '')) onSetNickname(session.id, next)
  }

  // highlight the focused cell only when a topbar is shown (grid mode);
  // in tabs mode a single terminal is always focused, so a border would be noise
  const highlight = focused && showBar

  return (
    <div
      className={`superior-terminal-cell absolute ${flushRight ? 'superior-terminal-cell--flush-right' : ''} ${
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
        className="superior-terminal-surface relative flex h-full w-full flex-col overflow-hidden"
        // xterm's bundled stylesheet defaults its scroll viewport to #000. The
        // canvas is row-aligned, so a fractional row at the bottom otherwise
        // exposes that black default in light terminals. Keep the viewport and
        // its cell wrapper on the exact same theme background.
        style={
          {
            backgroundColor: TERM_THEMES[resolved].background,
            '--terminal-background': TERM_THEMES[resolved].background
          } as React.CSSProperties
        }
      >
        {/* Active-cell highlight, drawn above the terminal content so it stays visible. */}
        {highlight && (
          <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] ring-2 ring-inset ring-accent" />
        )}
        {/* Always-visible topbar; the terminal sits below it, never behind it. */}
        {showBar && (
          <div
            onClick={() => onSelect(session.id)}
            style={barTint(session.color, active)}
            // The Ctrl+N focus shortcut lives in the bar's tooltip instead of a
            // chip, freeing space in small grid cells.
            title={
              shortcutNumber !== undefined && shortcutNumber <= 9
                ? `${t('terminal.focusHint')}: ${formatChord(`ctrl+${shortcutNumber}`)}`
                : undefined
            }
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b border-edge px-3 py-1.5 text-xs ${
              active ? 'bg-bar text-fg' : 'bg-bar/80 text-fgdim'
            }`}
          >
            {/* Identity zone — status, icon, name, nickname. Truncates first. */}
            <div className="group flex min-w-0 flex-1 items-center gap-1.5">
              <CellStatusDot session={session} />
              <PresetIcon
                iconType={session.iconType}
                icon={session.icon}
                className="h-4 w-4 text-sm"
              />
              <span className="shrink truncate">{session.label}</span>
              {editingNick ? (
                <>
                  <span className="shrink-0 text-fgmuted">·</span>
                  <input
                    autoFocus
                    value={nickDraft}
                    onChange={(e) => setNickDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') commitNick()
                      else if (e.key === 'Escape') setEditingNick(false)
                    }}
                    onBlur={commitNick}
                    placeholder={t('terminal.nicknamePlaceholder')}
                    size={12}
                    className="w-28 max-w-full shrink-0 rounded-sm border border-edge bg-panel px-1 py-0.5 text-xs text-fg placeholder:text-fgmuted focus:border-fgdim focus:outline-hidden"
                  />
                </>
              ) : (
                <>
                  {session.nickname && (
                    <span className="truncate text-fgmuted" title={session.nickname}>
                      · {session.nickname}
                    </span>
                  )}
                  {/* Pencil appears on hover; opens the inline nickname editor. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openNickEditor()
                    }}
                    className="shrink-0 text-fgmuted opacity-0 transition hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={t('terminal.setNickname')}
                    title={t('terminal.setNickname')}
                  >
                    <PencilIcon size={12} />
                  </button>
                </>
              )}
            </div>

            {/* Meta zone — live usage readout. */}
            <UsageBadge sessionId={session.id} />

            {/* Action zone — restart / maximize / close, right-aligned. */}
            <div className="flex shrink-0 items-center">
              {session.status !== 'running' && (
                <IconButton
                  size="sm"
                  label={t('terminal.restart')}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRestart(session.id)
                  }}
                >
                  <RestartIcon size={14} />
                </IconButton>
              )}
              <IconButton
                size="sm"
                label={maximized ? t('terminal.restore') : t('terminal.maximize')}
                title={shortcutTitle(
                  maximized ? t('terminal.restore') : t('terminal.maximize'),
                  'maximizeFocusedCell'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleMaximize(session.id)
                }}
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
              </IconButton>
              <IconButton
                size="sm"
                label={t('terminal.closeSession')}
                title={shortcutTitle(t('terminal.stopClose'), 'closeFocusedCell')}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(session.id)
                }}
              >
                <CloseIcon size={12} />
              </IconButton>
            </div>
          </div>
        )}
        <div ref={hostRef} data-terminal-host className="min-h-0 w-full flex-1" />

        {/* Dead-terminal affordance: the "[press Enter to restart]" scrollback
            line scrolls away; this chip stays put so a dead cell never looks
            frozen. */}
        {visible && session.status !== 'running' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestart(session.id)
            }}
            className={`solid-surface absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1 text-xs shadow-lg transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
              session.status === 'error'
                ? 'border-dangerBorder bg-panel text-danger hover:text-fg'
                : 'border-edge bg-panel text-fgdim hover:text-fg'
            }`}
          >
            <RestartIcon size={12} />
            <span>
              {session.exitCode == null
                ? t('terminal.notRunningChip')
                : t('terminal.exitedChip', { code: String(session.exitCode) })}
              {' · '}
              {t('terminal.restartHint')}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}, propsEqual)
