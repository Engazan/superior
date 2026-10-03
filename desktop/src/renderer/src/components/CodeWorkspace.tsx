import { lazy, Suspense, useEffect, useRef, type CSSProperties } from 'react'
import type { CodeAction, CodeTab, CodeWorkspaceState, EditorGroup } from '../codeWorkspace'
import { useI18n } from '../i18n'
import { CloseIcon, IconButton } from './ui'
import { FileTypeIcon } from './FileTypeIcon'

const FilePreviewPanel = lazy(() => import('./FilePreviewPanel').then((m) => ({ default: m.FilePreviewPanel })))
const TAB_DRAG_TYPE = 'application/x-superior-code-tab'

interface Props {
  state: CodeWorkspaceState
  visible: boolean
  dispatch: (action: CodeAction) => void
  onClose: (path: string) => void
  onDirtyChange: (path: string, dirty: boolean) => void
  dirtyPaths: ReadonlySet<string>
  onOpenFiles: () => void
}

export function CodeWorkspace({ state, visible, dispatch, onClose, onDirtyChange, dirtyPaths, onOpenFiles }: Props): React.JSX.Element {
  const { t } = useI18n()
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!visible) return
    host.current?.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]').forEach((tab) => {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  }, [visible, state.selected])
  const groups: EditorGroup[] = state.split ? [0, 1] : [0]
  const bounds = (group: EditorGroup): CSSProperties => ({
    left: group === 0 ? 0 : `${state.ratio * 100}%`,
    width: state.split ? `${(group === 0 ? state.ratio : 1 - state.ratio) * 100}%` : '100%'
  })
  return (
    <div ref={host} data-code-workspace className="relative h-full min-h-0 min-w-0 flex-1 bg-panel" hidden={!visible}
      onDragOver={(event) => { if (event.dataTransfer.types.includes(TAB_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
      onDrop={(event) => {
        const path = event.dataTransfer.getData(TAB_DRAG_TYPE)
        const rect = host.current?.getBoundingClientRect()
        if (!rect || !state.tabs.some((tab) => tab.file.path === path)) return
        event.preventDefault()
        dispatch({ type: 'move', path, group: event.clientX < rect.left + rect.width * (state.split ? state.ratio : 0.5) ? 0 : 1 })
      }}>
      {groups.map((group) => (
        <section key={group} aria-label={t('code.group', { n: group + 1 })}
          className="absolute inset-y-0 flex min-w-0 flex-col" style={bounds(group)}>
          <div className={`flex h-10 shrink-0 items-center border-b bg-bar ${state.focusedGroup === group ? 'border-accent/50' : 'border-edge'}`}>
            <div role="tablist" aria-label={t('code.group', { n: group + 1 })} className="flex min-w-0 flex-1 overflow-x-auto">
              {state.tabs.filter((tab) => tab.group === group).map((tab) => (
                <div key={tab.file.path} className={`flex shrink-0 items-center border-r border-edge ${state.selected[group] === tab.file.path ? 'bg-panel text-fg' : 'text-fgmuted'}`}>
                  <button role="tab" aria-selected={state.selected[group] === tab.file.path}
                    tabIndex={state.selected[group] === tab.file.path ? 0 : -1}
                    draggable onDragStart={(event) => { event.dataTransfer.setData(TAB_DRAG_TYPE, tab.file.path); event.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => dispatch({ type: 'select', path: tab.file.path })}
                    onKeyDown={(event) => {
                      const tabs = state.tabs.filter((item) => item.group === group)
                      const index = tabs.indexOf(tab)
                      const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
                        : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length]
                          : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : undefined
                      if (next) { event.preventDefault(); dispatch({ type: 'select', path: next.file.path }) }
                    }}
                    title={tab.file.path} className="flex h-10 max-w-56 items-center gap-2 px-3 text-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                    <FileTypeIcon name={tab.file.name} />
                    <span className="truncate">{tab.file.name}</span>
                    {dirtyPaths.has(tab.file.path) && <span aria-label={t('preview.unsaved')} className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  </button>
                  <IconButton size="sm" label={`${t('window.close')} ${tab.file.name}`} onClick={() => onClose(tab.file.path)}><CloseIcon size={12} /></IconButton>
                </div>
              ))}
            </div>
            <IconButton size="sm" label={t('code.split')} onClick={() => { const path = state.selected[group]; if (path) dispatch({ type: 'move', path, group: group === 0 ? 1 : 0 }); else dispatch({ type: 'split' }) }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M8 2v12" /></svg>
            </IconButton>
            {state.split && <IconButton size="sm" label={t('code.merge')} onClick={() => dispatch({ type: 'merge' })}><CloseIcon size={12} /></IconButton>}
          </div>
          {!state.selected[group] && <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-fgmuted" onPointerDown={() => dispatch({ type: 'focus', group })}>
            <span>{t('code.empty')}</span>
            <button className="rounded-md border border-edge px-3 py-1.5 text-xs text-fg hover:bg-hover" onClick={() => { dispatch({ type: 'focus', group }); onOpenFiles() }}>{t('code.openFiles')}</button>
          </div>}
        </section>
      ))}
      {/* Stable siblings: moving a tab to another group never remounts its editor. */}
      {state.tabs.map((tab) => <CodeDocument key={tab.file.path} tab={tab}
        visible={visible && state.selected[tab.group] === tab.file.path}
        focused={visible && state.focusedGroup === tab.group && state.selected[tab.group] === tab.file.path}
        style={bounds(tab.group)} onFocus={() => dispatch({ type: 'focus', group: tab.group })}
        onDirtyChange={(dirty) => onDirtyChange(tab.file.path, dirty)} />)}
      {state.split && <div role="separator" aria-label={t('code.resize')} aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(state.ratio * 100)} tabIndex={0}
        className="absolute inset-y-0 z-10 w-1 cursor-col-resize bg-edge hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden"
        style={{ left: `calc(${state.ratio * 100}% - 2px)`, touchAction: 'none' }}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); dispatch({ type: 'resize', ratio: state.ratio + (event.key === 'ArrowLeft' ? -0.05 : 0.05) }) } }}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = host.current?.getBoundingClientRect(); if (rect?.width) dispatch({ type: 'resize', ratio: (event.clientX - rect.left) / rect.width }) }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} />}
    </div>
  )
}

function CodeDocument({ tab, visible, focused, style, onFocus, onDirtyChange }: {
  tab: CodeTab; visible: boolean; focused: boolean; style: CSSProperties
  onFocus: () => void; onDirtyChange: (dirty: boolean) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!focused) return
    const target = lastFocus.current?.isConnected ? lastFocus.current : host.current?.querySelector<HTMLElement>('.cm-content')
    target?.focus({ preventScroll: true })
  }, [focused])
  return <div ref={host} role="tabpanel" aria-label={tab.file.name} hidden={!visible}
    className="absolute bottom-0 top-10 min-w-0" style={style}
    onPointerDownCapture={onFocus} onFocusCapture={(event) => { lastFocus.current = event.target as HTMLElement; onFocus() }}>
    <Suspense fallback={<div aria-busy="true" />}>
      <FilePreviewPanel file={tab.file} initialLine={tab.line} revealRequestId={tab.requestId}
        active={focused} onDirtyChange={onDirtyChange} />
    </Suspense>
  </div>
}
