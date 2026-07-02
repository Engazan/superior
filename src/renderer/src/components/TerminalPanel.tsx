import { useCallback, useRef, useState } from 'react'
import { TerminalView } from './TerminalView'
import { PresetMenu } from './PresetMenu'
import { AgentLauncher, type LaunchConfig } from './AgentLauncher'
import { useI18n } from '../i18n'
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
import type { AgentSession, TerminalPreset, WorkspaceTab } from '../types'

interface Props {
  /** All sessions across every workspace — kept mounted so buffers survive workspace switches. */
  sessions: AgentSession[]
  activeWorkspaceId: string | null
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
  /** launch wizard result — fill the active tab's grid */
  onStart: (config: LaunchConfig) => void
  /** add a single terminal (another grid cell) to the active tab */
  onLaunch: (preset: TerminalPreset) => void
  onManagePresets: () => void
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
  onStart,
  onLaunch,
  onManagePresets,
  onGridLayoutChange,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab
}: Props): JSX.Element {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<null | 'v' | 'h'>(null)
  // Stable identity so memoized TerminalViews don't re-render on every panel render.
  const handleExit = useCallback(
    (id: string, exitCode: number) =>
      onSessionUpdate(id, { status: exitCode === 0 ? 'exited' : 'error', exitCode }),
    [onSessionUpdate]
  )
  // Inline tab rename: the tab being edited and its draft name.
  const [editingTab, setEditingTab] = useState<{ id: string; name: string } | null>(null)

  // Terminals of the active tab (active workspace + active tab), in creation order.
  const tabSessions = sessions.filter(
    (s) => s.workspaceId === activeWorkspaceId && s.tabId === activeTabId
  )

  // Grid: map the first MAX_GRID sessions to their slot rectangles.
  const gridCells = tabSessions.slice(0, MAX_GRID)
  const dist = distribute(gridCells.length)
  const layout = matchesDist(gridLayout, dist) ? (gridLayout as GridLayout) : uniformLayout(dist)
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
    const move = (ev: PointerEvent): void => {
      const box = el.getBoundingClientRect()
      const fraction =
        d.axis === 'v'
          ? (ev.clientX - box.left) / box.width
          : (ev.clientY - box.top) / box.height
      onGridLayoutChange(applyDividerDrag(layout, d, fraction, !ev.altKey))
    }
    const up = (): void => {
      setResizing(null)
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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      {/* Tab strip — one chip per grid tab. Hidden until the workspace has its first tab. */}
      {activeWorkspaceId && tabs.length > 0 && (
        <div className="flex items-stretch border-b border-edge bg-bar">
          <div className="flex min-w-0 items-stretch gap-px overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              const editing = editingTab?.id === tab.id
              // Aggregate activity dot: green while any terminal in the tab runs,
              // grey once they've all exited, nothing for an empty tab.
              const tabCells = sessions.filter(
                (s) => s.workspaceId === activeWorkspaceId && s.tabId === tab.id
              )
              const running = tabCells.some((s) => s.status === 'running')
              return (
                <div
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  onDoubleClick={() => setEditingTab({ id: tab.id, name: tab.name })}
                  className={`group flex cursor-pointer items-center gap-2 border-r border-edge px-3 py-2 text-xs ${
                    active ? 'bg-panel text-fg' : 'text-fgdim hover:bg-panel/60'
                  }`}
                >
                  {tabCells.length > 0 && (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        running ? 'bg-emerald-400' : 'bg-zinc-500'
                      }`}
                    />
                  )}
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
                      className="w-24 min-w-0 rounded border border-edge bg-panel px-1 py-0.5 text-xs text-fg focus:border-fgdim focus:outline-none"
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
                      className="text-fgmuted opacity-0 transition group-hover:opacity-100 hover:text-fg"
                      aria-label={t('tab.close')}
                      title={t('tab.close')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center px-1">
            <button
              onClick={onAddTab}
              className="rounded px-2 py-1 text-sm text-fgdim transition hover:bg-hover hover:text-fg"
              aria-label={t('tab.new')}
              title={t('tab.new')}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Terminal stack — every session stays mounted; rect + visibility drive the layout. */}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {tabSessions.length === 0 &&
          (activeWorkspaceId ? (
            <AgentLauncher presets={presets} onStart={onStart} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fgmuted">
              {t('terminal.noWorkspace')}
            </div>
          ))}

        {sessions.map((s) => {
          const l = layoutFor(s)
          const isGridCell = s.workspaceId === activeWorkspaceId && s.tabId === activeTabId && gridIndex.has(s.id)
          return (
            <TerminalView
              key={s.id}
              session={s}
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
              onToggleMaximize={onToggleMaximize}
              onExit={handleExit}
            />
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
                  } ${hot ? `bg-sky-500 ${vertical ? 'w-0.5' : 'h-0.5'}` : 'bg-edge group-hover:bg-sky-500'}`}
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
