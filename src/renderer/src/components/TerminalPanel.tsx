import { useRef, useState } from 'react'
import { TerminalView } from './TerminalView'
import { PresetIcon } from './PresetIcon'
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
import type { AgentSession, TerminalPreset } from '../types'

export type LayoutMode = 'tabs' | 'grid'

interface Props {
  /** All sessions across every workspace — kept mounted so buffers survive workspace switches. */
  sessions: AgentSession[]
  activePath: string | null
  activeSessionId: string | null
  /** layout mode for the active workspace (undefined defaults to tabs) */
  layoutMode: LayoutMode | undefined
  /** saved cell sizing for the active workspace's grid (undefined → uniform) */
  gridLayout: GridLayout | undefined
  presets: TerminalPreset[]
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onSessionUpdate: (id: string, patch: Partial<AgentSession>) => void
  /** launch wizard result — start a fresh tabs/grid layout */
  onStart: (config: LaunchConfig) => void
  /** add a single terminal (a tab, or another grid cell) */
  onLaunch: (preset: TerminalPreset) => void
  onManagePresets: () => void
  /** persist a grid sizing change */
  onGridLayoutChange: (layout: GridLayout) => void
}

const STATUS_DOT: Record<AgentSession['status'], string> = {
  running: 'bg-emerald-400',
  exited: 'bg-zinc-500',
  error: 'bg-red-500'
}

interface Layout {
  rect?: Rect
  visible: boolean
  focused: boolean
}

export function TerminalPanel({
  sessions,
  activePath,
  activeSessionId,
  layoutMode,
  gridLayout,
  presets,
  onSelect,
  onClose,
  onSessionUpdate,
  onStart,
  onLaunch,
  onManagePresets,
  onGridLayoutChange
}: Props): JSX.Element {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<null | 'v' | 'h'>(null)

  // Sessions of the active workspace, in creation order.
  const workspaceSessions = sessions.filter((s) => s.workspacePath === activePath)
  const isGrid = layoutMode === 'grid'

  // Grid: map the first MAX_GRID sessions to their slot rectangles.
  const gridCells = workspaceSessions.slice(0, MAX_GRID)
  const dist = distribute(gridCells.length)
  const layout = matchesDist(gridLayout, dist) ? (gridLayout as GridLayout) : uniformLayout(dist)
  const rects = gridRects(dist, layout)
  const dividers = gridDividers(dist, layout)
  const gridIndex = new Map(gridCells.map((s, i) => [s.id, i] as const))

  const layoutFor = (s: AgentSession): Layout => {
    if (s.workspacePath !== activePath) return { visible: false, focused: false }
    if (isGrid) {
      const i = gridIndex.get(s.id)
      if (i === undefined) return { visible: false, focused: false }
      return { rect: rects[i], visible: true, focused: s.id === activeSessionId }
    }
    const active = s.id === activeSessionId
    return { visible: active, focused: active }
  }

  // Drag a divider: convert the pointer position to a fraction of the panel and
  // resize the two cells it separates. The layout is snapshotted at drag start.
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
      onGridLayoutChange(applyDividerDrag(layout, d, fraction))
    }
    const up = (): void => {
      setResizing(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      {/* Tab strip — only in tabs mode with at least one session. */}
      {!isGrid && workspaceSessions.length > 0 && (
        <div className="flex items-stretch border-b border-edge bg-bar">
          <div className="flex min-w-0 items-stretch gap-px overflow-x-auto">
            {workspaceSessions.map((s) => {
              const active = s.id === activeSessionId
              return (
                <div
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`group flex cursor-pointer items-center gap-2 border-r border-edge px-3 py-2 text-xs ${
                    active ? 'bg-panel text-fg' : 'text-fgdim hover:bg-panel/60'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status]}`} />
                  <PresetIcon iconType={s.iconType} icon={s.icon} className="h-3.5 w-3.5 text-sm" />
                  <span className="whitespace-nowrap">{s.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose(s.id)
                    }}
                    className="text-fgmuted opacity-0 transition group-hover:opacity-100 hover:text-fg"
                    aria-label={t('terminal.closeSession')}
                    title={t('terminal.stopClose')}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          {/* Kept outside the scroll container so its dropdown isn't clipped. */}
          <div className="flex shrink-0 items-center px-2">
            <PresetMenu presets={presets} onSelect={onLaunch} onManage={onManagePresets} />
          </div>
        </div>
      )}

      {/* Terminal stack — every session stays mounted; rect + visibility drive the layout. */}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {workspaceSessions.length === 0 && (
          <AgentLauncher presets={presets} onStart={onStart} />
        )}

        {sessions.map((s) => {
          const l = layoutFor(s)
          return (
            <TerminalView
              key={s.id}
              session={s}
              rect={l.rect}
              visible={l.visible}
              focused={l.focused}
              onExit={(id, exitCode) =>
                onSessionUpdate(id, {
                  status: exitCode === 0 ? 'exited' : 'error',
                  exitCode
                })
              }
            />
          )
        })}

        {/* Grid: draggable dividers double as the visible cell boundaries. */}
        {isGrid &&
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

        {/* Grid: compact per-cell chrome (label + status + close). */}
        {isGrid &&
          gridCells.map((s, i) => {
            const r = rects[i]
            return (
              <div
                key={`chrome-${s.id}`}
                className="pointer-events-none absolute z-30 p-2"
                style={{ top: `${r.top}%`, left: `${r.left}%`, width: `${r.width}%`, height: `${r.height}%` }}
              >
                <div
                  onClick={() => onSelect(s.id)}
                  className={`pointer-events-auto inline-flex w-fit max-w-full cursor-pointer items-center gap-2 rounded-md border border-edge px-2 py-1 text-xs shadow-sm ${
                    s.id === activeSessionId ? 'bg-bar text-fg' : 'bg-bar/80 text-fgdim'
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
                  <PresetIcon iconType={s.iconType} icon={s.icon} className="h-3.5 w-3.5 text-sm" />
                  <span className="truncate">{s.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose(s.id)
                    }}
                    className="shrink-0 text-fgmuted transition hover:text-fg"
                    aria-label={t('terminal.closeSession')}
                    title={t('terminal.stopClose')}
                  >
                    ✕
                  </button>
                </div>
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

        {isGrid && (
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
