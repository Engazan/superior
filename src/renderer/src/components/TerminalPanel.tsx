import { useCallback, useEffect, useRef, useState } from 'react'
import { TerminalView } from './TerminalView'
import { PresetMenu } from './PresetMenu'
import { AgentLauncher, type LaunchConfig } from './AgentLauncher'
import { PromptPicker } from './PromptPicker'
import { insertIntoTerminal, wrapForPty } from '../terminalInput'
import {
  Button,
  BroadcastIcon,
  CheckIcon,
  CloseIcon,
  IconButton,
  Menu,
  PencilIcon,
  PromptIcon
} from './ui'
import { useAttentionSessions, useBusySessions } from '../activityStore'
import { useAttentionColor } from '../attentionColor'
import { useI18n } from '../i18n'
import { useShortcutTitle } from '../shortcuts'
import {
  gridRects,
  gridDividers,
  distribute,
  uniformLayout,
  matchesDist,
  applyDividerDrag,
  MAX_GRID,
  type Rect,
  type GridLayout,
  type Divider
} from '../gridLayout'
import type { AgentSession, LayoutPreset, TerminalPreset, WorkspaceTab } from '../types'

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
  /** the active workspace's tabs (each tab is a grid of terminals) */
  tabs: WorkspaceTab[]
  /** the active tab within the active workspace */
  activeTabId: string | undefined
  /** saved cell sizing for the active tab's grid (undefined → uniform) */
  gridLayout: GridLayout | undefined
  presets: TerminalPreset[]
  onSelect: (id: string) => void
  /** toggle a grid cell's maximized state */
  onToggleMaximize: (id: string) => void
  onClose: (id: string) => void
  /** re-run an exited session's original preset command in place */
  onRestart: (id: string) => void
  onSessionUpdate: (id: string, patch: Partial<AgentSession>) => void
  /** set a terminal's user nickname (persisted); empty string clears it */
  onSetNickname: (id: string, nickname: string) => void
  /** launch wizard result — fill the active tab's grid */
  onStart: (config: LaunchConfig) => void
  /** add a single terminal (another grid cell) to the active tab */
  onLaunch: (preset: TerminalPreset) => void
  onManagePresets: () => void
  /** open the "Open / Clone project" modal (first-run empty state CTA) */
  onOpenProject: (source?: 'local' | 'git' | 'remote') => void
  /** persist a grid sizing change */
  onGridLayoutChange: (layout: GridLayout) => void
  /** switch the active tab */
  onSelectTab: (id: string) => void
  /** add a new (empty) tab */
  onAddTab: () => void
  /** close a tab (kills its terminals) */
  onCloseTab: (id: string) => void
  /** rename a tab */
  onRenameTab: (id: string, name: string) => void
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
  tabs,
  activeTabId,
  gridLayout,
  presets,
  onSelect,
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
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<null | 'v' | 'h'>(null)
  // Live layout while a divider drag is in flight. Only the release commits it
  // upstream (state + IPC write) — per-move commits would persist the tab
  // layout over IPC on every pointer event (see usePreviewPane for the same
  // persist-on-release pattern).
  const [dragLayout, setDragLayout] = useState<GridLayout | null>(null)
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
  // Inline tab rename: the tab being edited and its draft name.
  const [editingTab, setEditingTab] = useState<{ id: string; name: string } | null>(null)
  // Right-click context menu on a tab chip (Rename / Close).
  const [tabMenu, setTabMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(
    null
  )
  // Saved-prompt picker overlay (inserts into the active terminal).
  const [promptPickerOpen, setPromptPickerOpen] = useState(false)
  // Broadcast mode: one input bar typing into every running grid cell at once.
  // Stored as an *exclusion* set so cells launched or restarted (new session id)
  // while the bar is open participate by default instead of silently dropping out.
  const [broadcastMode, setBroadcastMode] = useState(false)
  const [broadcastExcluded, setBroadcastExcluded] = useState<Set<string>>(new Set())

  // Terminals of the active tab (active workspace + active tab), in creation order.
  const tabSessions = sessions.filter(
    (s) => s.workspaceId === activeWorkspaceId && s.tabId === activeTabId
  )

  // Grid: map the first MAX_GRID sessions to their slot rectangles.
  const gridCells = tabSessions.slice(0, MAX_GRID)
  const dist = distribute(gridCells.length)
  const committedLayout = matchesDist(gridLayout, dist)
    ? (gridLayout as GridLayout)
    : uniformLayout(dist)
  const layout = dragLayout && matchesDist(dragLayout, dist) ? dragLayout : committedLayout
  const rects = gridRects(dist, layout)
  const dividers = gridDividers(dist, layout)
  const gridIndex = new Map(gridCells.map((s, i) => [s.id, i] as const))

  // Only honor a maximized id while that cell still exists in the current grid.
  const maxId = gridCells.some((s) => s.id === maximizedId) ? maximizedId : null

  const layoutFor = (s: AgentSession): Layout => {
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
  const startDrag = (d: Divider) => (e: React.PointerEvent): void => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    setResizing(d.axis)
    let latest: GridLayout | null = null
    const move = (ev: PointerEvent): void => {
      const box = el.getBoundingClientRect()
      const fraction =
        d.axis === 'v'
          ? (ev.clientX - box.left) / box.width
          : (ev.clientY - box.top) / box.height
      latest = applyDividerDrag(layout, d, fraction, !ev.altKey)
      setDragLayout(latest)
    }
    const up = (): void => {
      setResizing(null)
      if (latest) onGridLayoutChange(latest)
      setDragLayout(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const commitRename = (): void => {
    if (!editingTab) return
    const name = editingTab.name.trim()
    if (name) onRenameTab(editingTab.id, name)
    setEditingTab(null)
  }

  const insertPrompt = (text: string, submit: boolean): void => {
    if (activeSessionId) insertIntoTerminal(activeSessionId, text, submit)
  }

  // Entering broadcast mode targets every running cell of the current grid.
  const toggleBroadcast = (): void => {
    setBroadcastMode((on) => {
      if (on) return false
      setBroadcastExcluded(new Set())
      return true
    })
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
    const payload = wrapForPty(text) + '\r'
    for (const s of broadcastTargets) window.api.sendInput(s.id, payload)
  }

  // Switching tab/workspace invalidates the targeted cells — drop the mode.
  useEffect(() => {
    setBroadcastMode(false)
    setBroadcastExcluded(new Set())
  }, [activeTabId, activeWorkspaceId])


  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel/75">
      {/* Tab strip — one chip per grid tab. Hidden until the workspace has its first tab. */}
      {activeWorkspaceId && tabs.length > 0 && (
        <div role="tablist" aria-label={t('tab.listLabel')} className="flex items-center border-b border-edge bg-panel/90 px-2 py-1.5">
          <div className="flex min-w-0 items-stretch gap-px overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              const editing = editingTab?.id === tab.id
              const tabCells = sessions.filter(
                (s) => s.workspaceId === activeWorkspaceId && s.tabId === tab.id
              )
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  tabIndex={0}
                  onClick={() => onSelectTab(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectTab(tab.id)
                    }
                  }}
                  onDoubleClick={() => setEditingTab({ id: tab.id, name: tab.name })}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setTabMenu({ id: tab.id, name: tab.name, x: e.clientX, y: e.clientY })
                  }}
                  className={`group flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${
                    active ? 'bg-accentBg font-semibold text-fg shadow-xs ring-1 ring-inset ring-accentBorder' : 'text-fgdim hover:bg-hover'
                  }`}
                >
                  {tabCells.length > 0 && <TabActivityDot cells={tabCells} />}
                  {editing ? (
                    <input
                      autoFocus
                      value={editingTab.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingTab({ id: tab.id, name: e.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        else if (e.key === 'Escape') setEditingTab(null)
                      }}
                      className="w-24 min-w-0 rounded-sm border border-edge bg-panel px-1 py-0.5 text-xs text-fg focus:border-fgdim focus:outline-hidden"
                    />
                  ) : (
                    <span className="whitespace-nowrap" title={t('tab.rename')}>
                      {tab.name}
                    </span>
                  )}
                  {!editing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCloseTab(tab.id)
                      }}
                      className="text-fgmuted opacity-0 transition group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
                      aria-label={t('tab.close')}
                      title={t('tab.close')}
                    >
                      <CloseIcon size={11} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center px-1">
            <button
              onClick={onAddTab}
              className="rounded-sm px-2 py-1 text-sm text-fgdim transition hover:bg-hover hover:text-fg"
              aria-label={t('tab.new')}
              title={t('tab.new')}
            >
              +
            </button>
          </div>

          {/* Right-side tools: insert a saved prompt / broadcast to all cells. */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 px-1">
            <IconButton
              size="sm"
              label={t('prompts.insert')}
              disabled={!activeSessionId}
              onClick={() => setPromptPickerOpen(true)}
            >
              <PromptIcon size={14} />
            </IconButton>
            <IconButton
              size="sm"
              label={t('broadcast.toggle')}
              disabled={gridCells.length === 0}
              className={broadcastMode ? '!text-warn' : ''}
              onClick={toggleBroadcast}
            >
              <BroadcastIcon size={14} />
            </IconButton>
          </div>
        </div>
      )}

      {/* Broadcast bar — one line of input sent to every targeted cell. */}
      {broadcastMode && (
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
                setBroadcastMode(false)
              }
            }}
            placeholder={t('broadcast.placeholder', { n: broadcastTargets.length })}
            className="h-7 min-w-0 flex-1 rounded-md border border-edge bg-panel px-2 text-xs text-fg placeholder:text-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-warn/50"
          />
          <IconButton size="sm" label={t('broadcast.exit')} onClick={() => setBroadcastMode(false)}>
            <CloseIcon size={12} />
          </IconButton>
        </div>
      )}

      {promptPickerOpen && (
        <PromptPicker
          onPick={(p, submit) => insertPrompt(p.text, submit)}
          onClose={() => setPromptPickerOpen(false)}
        />
      )}

      {/* Tab context menu — same actions as double-click rename + hover close. */}
      {tabMenu && (
        <Menu
          anchor={{ x: tabMenu.x, y: tabMenu.y }}
          onClose={() => setTabMenu(null)}
          items={[
            {
              id: 'rename',
              label: t('tab.renameAction'),
              icon: <PencilIcon size={13} />,
              onSelect: () => setEditingTab({ id: tabMenu.id, name: tabMenu.name })
            },
            'separator',
            {
              id: 'close',
              label: t('tab.close'),
              icon: <CloseIcon size={13} />,
              tone: 'danger',
              onSelect: () => onCloseTab(tabMenu.id)
            }
          ]}
        />
      )}

      {/* Terminal stack — every session stays mounted; rect + visibility drive the layout. */}
      <div ref={containerRef} className="relative min-h-0 flex-1 py-1 pl-1">
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
              session={s}
              workingDir={workingDir}
              rect={l.rect}
              visible={l.visible}
              focused={l.focused}
              showBar={isGridCell}
              shortcutNumber={isGridCell ? (gridIndex.get(s.id) ?? 0) + 1 : undefined}
              active={s.id === activeSessionId}
              maximized={s.id === maxId}
              animate={!resizing}
              onSelect={onSelect}
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
          <div className="absolute bottom-3 right-3 z-50 rounded-md border border-edge bg-bar shadow-lg">
            <PresetMenu
              presets={presets}
              disabled={gridCells.length >= MAX_GRID}
              dropUp
              onSelect={onLaunch}
              onManage={onManagePresets}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Aggregate activity dot for one tab chip. Subscribes to the activity store
 * itself so per-chunk busy churn re-renders only these dots, not the panel:
 * attention color = a terminal finished and hasn't been seen, pulsing green =
 * output streaming, steady green = running-idle, grey = all exited.
 */
function TabActivityDot({ cells }: { cells: AgentSession[] }): React.JSX.Element {
  const { t } = useI18n()
  const busy = useBusySessions()
  const attention = useAttentionSessions()
  const { attentionColor } = useAttentionColor()
  const hasAttention = cells.some((s) => attention.has(s.id))
  const isBusy = cells.some((s) => s.status === 'running' && busy.has(s.id))
  const running = cells.some((s) => s.status === 'running')
  if (hasAttention) {
    return (
      <span
        className="h-2 w-2 shrink-0 animate-pulse rounded-full"
        style={{ backgroundColor: attentionColor }}
        title={t('terminal.statusFinished')}
      />
    )
  }
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${
        isBusy ? 'animate-pulse bg-status' : running ? 'bg-status' : 'bg-fgmuted'
      }`}
      title={isBusy ? t('terminal.statusWorking') : undefined}
    />
  )
}
