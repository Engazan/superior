import { useCallback, useEffect, useRef, useState } from 'react'
import { TerminalView } from './TerminalView'
import { PresetMenu } from './PresetMenu'
import { AgentLauncher, type LaunchConfig } from './AgentLauncher'
import { insertIntoTerminal } from '../terminalInput'
import {
  Button,
  BroadcastIcon,
  CheckIcon,
  CloseIcon,
  IconButton,
  RestartIcon
} from './ui'
import { useI18n } from '../i18n'
import { interruptedSessions } from '../interruptedSessions'
import { paneGeometry, resolvePaneTree, resizePane, dropDirection, type PaneDivider } from '../paneLayout'
import { movePane } from '@shared/pane-layout'
import type { PaneDirection, PaneNode } from '@shared/types'
import { useShortcutTitle } from '../shortcuts'
import {
  MAX_GRID,
  type Rect,
  type GridLayout,
} from '../gridLayout'
import type {
  AgentSession,
  FileLinkTarget,
  LayoutPreset,
  TerminalPreset
} from '../types'

interface Props {
  /** All sessions across every workspace — kept mounted so buffers survive workspace switches. */
  sessions: AgentSession[]
  activeWorkspaceId: string | null
  /** the active workspace's working directory (worktree or folder path), shown in the launcher */
  workingDir: string | null
  /** saved launch layouts shown in the launcher's Preset tab */
  layoutPresets: LayoutPreset[]
  /** the active workspace's auto-launch layout, if any */
  startupLayoutId?: string
  /** set (or clear) the active workspace's auto-launch layout */
  onSetStartupLayout: (layoutId: string | null) => void
  /** persist a new/updated layout preset */
  onSaveLayoutPreset: (layout: LayoutPreset) => Promise<void>
  /** remove a saved layout preset */
  onDeleteLayoutPreset: (id: string) => Promise<void>
  activeSessionId: string | null
  /** the grid cell blown up to fill the whole panel, or null (owned by App so shortcuts can drive it) */
  maximizedId: string | null
  /** the active tab within the active workspace */
  activeTabId: string | undefined
  /** False while Code or settings is shown; terminal sessions stay mounted. */
  surfaceActive: boolean
  /** saved cell sizing for the active tab's grid (undefined → uniform) */
  gridLayout: GridLayout | undefined
  presets: TerminalPreset[]
  onSelect: (id: string) => void
  /** open a terminal file link in Superior's built-in preview editor */
  onOpenFileTarget: (target: FileLinkTarget) => void
  /** toggle a grid cell's maximized state */
  onToggleMaximize: (id: string) => void
  onClose: (id: string) => void
  /** re-run an exited session's original preset command in place */
  onRestart: (id: string) => Promise<void>
  onSessionUpdate: (id: string, patch: Partial<AgentSession>) => void
  /** set a terminal's user nickname (persisted); empty string clears it */
  onSetNickname: (id: string, nickname: string) => void
  /** launch wizard result — fill the active tab's grid */
  onStart: (config: LaunchConfig) => void
  /** add a single terminal (another grid cell) to the active tab */
  onLaunch: (preset: TerminalPreset, placement?: { targetId: string; direction: PaneDirection }) => Promise<void>
  onManagePresets: () => void
  /** open the "Open / Clone project" modal (first-run empty state CTA) */
  onOpenProject: (source?: 'local' | 'git' | 'remote') => void
  /** persist a grid sizing change */
  onGridLayoutChange: (layout: GridLayout) => void
  /** Broadcast mode is controlled from the window topbar. */
  broadcastMode: boolean
  onBroadcastModeChange: (active: boolean) => void
}

interface Layout {
  rect?: Rect
  visible: boolean
  focused: boolean
}

export function TerminalPanel({
  sessions,
  activeWorkspaceId,
  workingDir,
  layoutPresets,
  startupLayoutId,
  onSetStartupLayout,
  onSaveLayoutPreset,
  onDeleteLayoutPreset,
  activeSessionId,
  maximizedId,
  activeTabId,
  surfaceActive,
  gridLayout,
  presets,
  onSelect,
  onOpenFileTarget,
  onToggleMaximize,
  onClose,
  onRestart,
  onSessionUpdate,
  onSetNickname,
  onStart,
  onLaunch,
  onManagePresets,
  onOpenProject,
  onGridLayoutChange,
  broadcastMode,
  onBroadcastModeChange
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<null | 'v' | 'h'>(null)
  // Live layout while a divider drag is in flight. Only the release commits it
  // upstream (state + IPC write) — per-move commits would persist the tab
  // layout over IPC on every pointer event.
  const [dragTree, setDragTree] = useState<PaneNode | undefined>()
  const [moving, setMoving] = useState(false)
  const [drop, setDrop] = useState<{ target: string; direction: PaneDirection; rect: Rect } | null>(null)
  const [launching, setLaunching] = useState(false)
  const launchLock = useRef(false)
  const cancelDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => { cancelDrag.current?.() }, [activeWorkspaceId, activeTabId, surfaceActive, sessions, maximizedId])
  // Stable identity so memoized TerminalViews don't re-render on every panel render.
  // 130 (SIGINT) and 143 (SIGTERM) are ordinary interactive quits — a red
  // "error" dot for Ctrl+C would cry wolf and erode the real-crash signal.
  const handleExit = useCallback(
    (id: string, exitCode: number | null) =>
      onSessionUpdate(id, {
        status: exitCode === 0 || exitCode === 130 || exitCode === 143 ? 'exited' : 'error',
        exitCode
      }),
    [onSessionUpdate]
  )
  // Broadcast mode: one input bar typing into every running grid cell at once.
  // Stored as an *exclusion* set so cells launched or restarted (new session id)
  // while the bar is open participate by default instead of silently dropping out.
  const [broadcastExcluded, setBroadcastExcluded] = useState<Set<string>>(new Set())
  const [restoringInterrupted, setRestoringInterrupted] = useState(false)

  // A cold OS boot cannot preserve PTYs, but the persisted session snapshots
  // retain everything needed to launch replacements into the same grid slots.
  const interrupted = interruptedSessions(sessions)

  const restoreAllInterrupted = async (): Promise<void> => {
    if (restoringInterrupted) return
    setRestoringInterrupted(true)
    try {
      // Restore sequentially so a large saved layout does not hammer the daemon
      // with a burst of simultaneous process spawns.
      for (const session of interrupted) await onRestart(session.id)
    } finally {
      setRestoringInterrupted(false)
    }
  }

  // Terminals of the active tab (active workspace + active tab), in creation order.
  const tabSessions = sessions.filter(
    (s) => s.workspaceId === activeWorkspaceId && s.tabId === activeTabId
  )

  // Grid: map the first MAX_GRID sessions to their slot rectangles.
  const gridCells = tabSessions.slice(0, MAX_GRID)
  const tree = dragTree ?? resolvePaneTree(gridCells.map((s) => s.id), gridLayout)
  useEffect(() => {
    if (tree && !dragTree && JSON.stringify(tree) !== JSON.stringify(gridLayout?.tree)) {
      onGridLayoutChange({ rows: [], cols: [], tree })
    }
  }, [tree, dragTree, gridLayout, onGridLayoutChange])
  const geometry = paneGeometry(tree)
  const rects = gridCells.map((s) => geometry.rects.get(s.id)!)
  const dividers = geometry.dividers
  const gridIndex = new Map(gridCells.map((s, i) => [s.id, i] as const))

  // Only honor a maximized id while that cell still exists in the current grid.
  const maxId = gridCells.some((s) => s.id === maximizedId) ? maximizedId : null

  const layoutFor = (s: AgentSession): Layout => {
    if (!surfaceActive) return { visible: false, focused: false }
    if (s.workspaceId !== activeWorkspaceId || s.tabId !== activeTabId) {
      return { visible: false, focused: false }
    }
    const i = gridIndex.get(s.id)
    if (i === undefined) return { visible: false, focused: false }
    if (maxId) {
      // The maximized cell fills the panel (rect undefined → no highlight ring); others hide.
      if (s.id !== maxId) return { visible: false, focused: false }
      return { visible: true, focused: true }
    }
    return { rect: rects[i], visible: true, focused: s.id === activeSessionId }
  }

  // Drag a divider: convert the pointer position to a fraction of the panel and
  // resize the two cells it separates. The layout is snapshotted at drag start.
  // Dividers snap to even-split guides; hold Alt to drag freely.
  const commitTree = (next: PaneNode): void => onGridLayoutChange({ rows: [], cols: [], tree: next })

  const launch = async (preset: TerminalPreset, placement?: { targetId: string; direction: PaneDirection }): Promise<void> => {
    if (launchLock.current || gridCells.length >= MAX_GRID) return
    launchLock.current = true
    setLaunching(true)
    if (maxId) onToggleMaximize(maxId)
    try { await onLaunch(preset, placement) }
    finally { launchLock.current = false; setLaunching(false) }
  }

  const startDrag = (d: PaneDivider) => (event: React.PointerEvent): void => {
    if (event.button !== 0 || !tree || launching) return
    event.preventDefault()
    cancelDrag.current?.()
    const el = containerRef.current
    if (!el) return
    setResizing(d.axis)
    let latest = tree
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId !== event.pointerId) return
      const box = el.getBoundingClientRect()
      const percent = d.axis === 'v' ? (ev.clientX - box.left) / box.width * 100 : (ev.clientY - box.top) / box.height * 100
      let ratio = (percent - (d.axis === 'v' ? d.bounds.left : d.bounds.top)) / (d.axis === 'v' ? d.bounds.width : d.bounds.height)
      if (!ev.altKey) for (const guide of [0.25, 1 / 3, 0.5, 2 / 3, 0.75]) {
        if (Math.abs(ratio - guide) < 0.025) { ratio = guide; break }
      }
      latest = resizePane(tree, d.path, ratio)
      setDragTree(latest)
    }
    const finish = (commit: boolean): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key)
      cancelDrag.current = null
      setResizing(null); setDragTree(undefined)
      if (commit && latest !== tree) commitTree(latest)
    }
    const up = (ev: PointerEvent): void => { if (ev.pointerId === event.pointerId) finish(true) }
    const cancel = (): void => finish(false)
    const key = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') { ev.preventDefault(); cancel() } }
    cancelDrag.current = cancel
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key)
  }

  const startPaneDrag = (id: string, event: React.PointerEvent): void => {
    if (event.button !== 0 || event.ctrlKey || !tree || gridCells.length < 2 || maxId || launching) return
    event.preventDefault()
    onSelect(id)
    cancelDrag.current?.()
    const el = containerRef.current
    if (!el) return
    const startX = event.clientX, startY = event.clientY, pointerId = event.pointerId
    let active = false
    let target: { target: string; direction: PaneDirection; rect: Rect } | null = null
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
      active = true
      setMoving(true)
      const box = el.getBoundingClientRect()
      const x = (ev.clientX - box.left) / box.width * 100, y = (ev.clientY - box.top) / box.height * 100
      target = null
      for (const [targetId, r] of geometry.rects) {
        if (id === targetId || x < r.left || x > r.left + r.width || y < r.top || y > r.top + r.height) continue
        const direction = dropDirection(x, y, r)
        const next = movePane(tree, id, targetId, direction)
        if (next === tree) break
        // Preview the actual final rectangle, including space reclaimed at the source.
        target = { target: targetId, direction, rect: paneGeometry(next).rects.get(id)! }
        break
      }
      setDrop(target)
    }
    const finish = (commit: boolean): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key)
      cancelDrag.current = null
      setMoving(false); setDrop(null)
      if (commit && target) { commitTree(movePane(tree, id, target.target, target.direction)); onSelect(id) }
    }
    const up = (ev: PointerEvent): void => { if (ev.pointerId === pointerId) { if (active) move(ev); finish(true) } }
    const cancel = (): void => finish(false)
    const key = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') { ev.preventDefault(); cancel() } }
    cancelDrag.current = cancel
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key)
  }
  const toggleTarget = (id: string): void => {
    setBroadcastExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Live recipient list: running cells of the current grid minus opt-outs.
  const broadcastTargets = gridCells.filter(
    (s) => s.status === 'running' && !broadcastExcluded.has(s.id)
  )

  const sendBroadcast = (text: string): void => {
    for (const s of broadcastTargets) insertIntoTerminal(s.id, text, true)
  }

  // Switching tab/workspace invalidates the targeted cells — drop the mode.
  useEffect(() => {
    onBroadcastModeChange(false)
    setBroadcastExcluded(new Set())
  }, [activeTabId, activeWorkspaceId, surfaceActive, onBroadcastModeChange])

  // Every newly opened broadcast session starts with all running cells targeted.
  useEffect(() => {
    if (broadcastMode) setBroadcastExcluded(new Set())
  }, [broadcastMode])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-transparent">
      {interrupted.length > 0 && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-3 border-b border-accentBorder bg-accentBg/60 px-3 py-2"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel text-accent ring-1 ring-inset ring-accentBorder">
            <RestartIcon size={14} />
          </span>
          <span className="min-w-0 flex-1 text-xs text-fg2">
            {t('terminal.interruptedBanner', { count: interrupted.length })}
          </span>
          <Button
            size="sm"
            loading={restoringInterrupted}
            onClick={() => void restoreAllInterrupted()}
          >
            {t('terminal.restoreAll')}
          </Button>
        </div>
      )}

      {/* Broadcast bar — one line of input sent to every targeted cell. */}
      {broadcastMode && surfaceActive && (
        <div className="flex shrink-0 items-center gap-2 border-b border-warnBorder bg-warnBg/40 px-2 py-1.5">
          <BroadcastIcon size={13} className="shrink-0 text-warn" />
          <input
            autoFocus
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                const value = e.currentTarget.value
                if (value.trim()) {
                  sendBroadcast(value)
                  e.currentTarget.value = ''
                }
              } else if (e.key === 'Escape') {
                onBroadcastModeChange(false)
              }
            }}
            placeholder={t('broadcast.placeholder', { n: broadcastTargets.length })}
            className="h-7 min-w-0 flex-1 rounded-md border border-edge bg-panel px-2 text-xs text-fg placeholder:text-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-warn/50"
          />
          <IconButton size="sm" label={t('broadcast.exit')} onClick={() => onBroadcastModeChange(false)}>
            <CloseIcon size={12} />
          </IconButton>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {/* Terminal stack — every session stays mounted; rect + visibility drive the layout. */}
        <div
          ref={containerRef}
          aria-hidden={!surfaceActive}
          className={`absolute inset-0 py-1 pl-1 ${
            !surfaceActive ? 'invisible pointer-events-none' : ''
          }`}
        >
        {tabSessions.length === 0 &&
          (activeWorkspaceId ? (
            <AgentLauncher
              presets={presets}
              workingDir={workingDir}
              layoutPresets={layoutPresets}
              startupLayoutId={startupLayoutId}
              onSetStartupLayout={onSetStartupLayout}
              onSaveLayoutPreset={onSaveLayoutPreset}
              onDeleteLayoutPreset={onDeleteLayoutPreset}
              onStart={onStart}
              onManagePresets={onManagePresets}
            />
          ) : (
            // First-run empty state: a real path forward, not just a sentence.
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accentBg text-2xl text-accent ring-1 ring-inset ring-accentBorder">
                +
              </div>
              <div>
                <h2 className="text-lg font-semibold text-fg">{t('terminal.noWorkspaceTitle')}</h2>
                <p className="mt-1 max-w-md text-sm text-fgmuted">
                  {t('terminal.noWorkspaceDescription')}
                </p>
              </div>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-3">
                <Button variant="primary" onClick={() => onOpenProject('local')}>
                  {t('terminal.openLocal')}
                </Button>
                <Button variant="secondary" onClick={() => onOpenProject('git')}>
                  {t('terminal.cloneGit')}
                </Button>
                <Button variant="secondary" onClick={() => onOpenProject('remote')}>
                  {t('terminal.connectSsh')}
                </Button>
              </div>
              <p className="text-xs text-fgmuted">
                {shortcutTitle(t('keyboard.openPalette'), 'openPalette')}
              </p>
            </div>
          ))}

        {sessions.map((s) => {
          const l = layoutFor(s)
          const isGridCell = s.workspaceId === activeWorkspaceId && s.tabId === activeTabId && gridIndex.has(s.id)
          return (
            <TerminalView
              key={s.id}
              presets={presets}
              splitDisabled={launching || gridCells.length >= MAX_GRID}
              onManagePresets={onManagePresets}
              onSplit={(id, preset, direction) => { void launch(preset, { targetId: id, direction }) }}
              onPaneDrag={startPaneDrag}
              session={s}
              workingDir={workingDir}
              rect={l.rect}
              visible={l.visible}
              focused={l.focused}
              showBar={isGridCell}
              shortcutNumber={isGridCell ? (gridIndex.get(s.id) ?? 0) + 1 : undefined}
              active={s.id === activeSessionId}
              maximized={s.id === maxId}
              animate={!resizing && !moving}
              onSelect={onSelect}
              onOpenFileTarget={onOpenFileTarget}
              onClose={onClose}
              onRestart={onRestart}
              onSetNickname={onSetNickname}
              onToggleMaximize={onToggleMaximize}
              onExit={handleExit}
            />
          )
        })}

        {/* Broadcast targeting: a ring over each targeted cell plus a corner
            toggle — drawn from the grid rects, so TerminalView stays untouched. */}
        {broadcastMode &&
          !maxId &&
          gridCells.map((s, i) => {
            const r = rects[i]
            if (!r || s.status !== 'running') return null
            const targeted = !broadcastExcluded.has(s.id)
            return (
              <div
                key={`bc-${s.id}`}
                className="pointer-events-none absolute z-30"
                style={{
                  top: `${r.top}%`,
                  left: `${r.left}%`,
                  width: `${r.width}%`,
                  height: `${r.height}%`
                }}
              >
                {targeted && (
                  <div className="absolute inset-0 ring-2 ring-inset ring-warn/70" />
                )}
                <button
                  onClick={() => toggleTarget(s.id)}
                  title={t('broadcast.target')}
                  aria-pressed={targeted}
                  className={`pointer-events-auto absolute right-2 top-9 grid h-5 w-5 place-items-center rounded-full border transition ${
                    targeted
                      ? 'border-warn bg-warn text-bar'
                      : 'border-edge bg-panel text-fgmuted hover:text-fg'
                  }`}
                >
                  <CheckIcon size={11} />
                </button>
              </div>
            )
          })}

        {/* Grid: draggable dividers double as the visible cell boundaries. */}
        {!maxId &&
          dividers.map((d, i) => {
            const vertical = d.axis === 'v'
            const hot = resizing === d.axis
            return (
              <div
                key={`div-${i}`}
                onPointerDown={startDrag(d)}
                title={t('grid.dividerHint')}
                className={`group absolute z-20 flex ${
                  vertical ? 'cursor-col-resize justify-center' : 'cursor-row-resize items-center'
                }`}
                style={
                  vertical
                    ? {
                        left: `${d.pos}%`,
                        top: `${d.start}%`,
                        height: `${d.length}%`,
                        width: 12,
                        transform: 'translateX(-50%)'
                      }
                    : {
                        top: `${d.pos}%`,
                        left: `${d.start}%`,
                        width: `${d.length}%`,
                        height: 12,
                        transform: 'translateY(-50%)'
                      }
                }
              >
                <span
                  className={`transition ${
                    vertical ? 'h-full w-px group-hover:w-0.5' : 'h-px w-full group-hover:h-0.5'
                  } ${hot ? `bg-accent ${vertical ? 'w-0.5' : 'h-0.5'}` : 'bg-edge group-hover:bg-accent'}`}
                />
              </div>
            )
          })}

        {/* While dragging, an overlay stops the terminals from swallowing the pointer. */}
        {moving && <div className="absolute inset-0 z-40 cursor-grabbing">
          {drop && <div className="pointer-events-none absolute flex items-center justify-center border-2 border-accent bg-accent/20 text-xs font-semibold text-fg"
            style={{ left: `${drop.rect.left}%`, top: `${drop.rect.top}%`, width: `${drop.rect.width}%`, height: `${drop.rect.height}%` }}>
            <span className="solid-surface rounded bg-panel px-3 py-2 shadow">{t(`pane.${drop.direction}`)}</span>
          </div>}
        </div>}
        {resizing && (
          <div
            className={`absolute inset-0 z-40 ${
              resizing === 'v' ? 'cursor-col-resize' : 'cursor-row-resize'
            }`}
          />
        )}

        {/* Sessions beyond the grid capacity stay mounted but invisible — say
            so instead of losing them silently. */}
        {tabSessions.length > MAX_GRID && (
          <div className="solid-surface absolute bottom-3 left-3 z-50 rounded-full border border-warnBorder bg-panel px-3 py-1 text-[11px] text-warn shadow-lg">
            {t('terminal.hiddenSessions', { n: tabSessions.length - MAX_GRID })}
          </div>
        )}

        {activeWorkspaceId && tabSessions.length > 0 && (
          <div className="solid-surface absolute bottom-3 right-3 z-50 rounded-md border border-edge bg-bar shadow-lg">
            <PresetMenu
              presets={presets}
              disabled={launching || gridCells.length >= MAX_GRID}
              dropUp
              onSelect={(preset) => { void launch(preset) }}
              onManage={onManagePresets}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
