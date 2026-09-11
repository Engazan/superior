import { useCallback, useEffect, useRef, useState } from 'react'
import { browserUrl } from '@shared/browser'
import { useI18n } from '../i18n'
import { useOverlayCount } from '../overlayStack'
import { reviewTargets } from '../diffReview'
import { noteActivityInput } from '../activityStore'
import { Button, Modal, Select, useToast } from './ui'
import type { AgentSession, BrowserRequest, BrowserSelection, BrowserState, Workspace } from '../types'

interface BrowserLink { workspaceId: string; url: string }

interface Props {
  browserLink: BrowserLink | null
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  visible: boolean
  sessions: AgentSession[]
  onSent: (session: AgentSession) => void
}

/** Keep visited browser surfaces mounted so navigation and pending feedback survive mode switches. */
export function BrowserDeck({ browserLink, workspaces, activeWorkspaceId, visible, sessions, onSent }: Props): React.JSX.Element {
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (visible && activeWorkspaceId) setVisited((ids) => ids.includes(activeWorkspaceId) ? ids : [...ids, activeWorkspaceId])
  }, [activeWorkspaceId, visible])
  return <>{workspaces.filter((workspace) => visited.includes(workspace.id)).map((workspace) =>
    <BrowserWorkspace browserLink={browserLink?.workspaceId === workspace.id ? browserLink : null} key={workspace.id} workspace={workspace} sessions={sessions} onSent={onSent}
      visible={visible && activeWorkspaceId === workspace.id} />)}</>
}

function readUrl(id: string): string {
  try { const value = localStorage.getItem(`superior.browser.url.${id}`); return value ? browserUrl(value) : '' } catch { return '' }
}

function BrowserWorkspace({ browserLink, workspace, visible, sessions, onSent }: {
  browserLink: BrowserLink | null; workspace: Workspace; visible: boolean; sessions: AgentSession[]; onSent: (session: AgentSession) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const overlays = useOverlayCount()
  const [initialUrl] = useState(() => readUrl(workspace.id))
  const [address, setAddress] = useState(initialUrl || 'http://localhost:3000')
  const [state, setState] = useState<BrowserState>({ workspaceId: workspace.id, url: initialUrl,
    title: '', loading: false, canGoBack: false, canGoForward: false, designMode: false, error: null })
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<BrowserSelection | null>(null)
  const [selectionOpen, setSelectionOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const addressInput = useRef<HTMLInputElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const previousUrl = useRef(initialUrl)
  const consumedLink = useRef<BrowserLink | null>(null)
  const receiveState = useCallback((next: BrowserState): void => {
    if (!mounted.current || next.workspaceId !== workspace.id) return
    setState(next)
    if (next.url && next.url !== 'about:blank' && next.url !== previousUrl.current) {
      previousUrl.current = next.url
      setAddress(next.url)
      try { localStorage.setItem(`superior.browser.url.${workspace.id}`, browserUrl(next.url)) } catch { /* Browsing still works without saved history. */ }
    }
  }, [workspace.id])
  const request = useCallback(async (action: BrowserRequest): Promise<void> => {
    try {
      const next = await window.api.browserRequest(action)
      if (next) receiveState(next)
      if (mounted.current) setError('')
    } catch { if (mounted.current) setError(t('browser.requestFailed')) }
  }, [receiveState, t])
  // Stable callbacks for the viewport observer; locale renders must not recreate its loop.
  const requestRef = useRef(request)
  requestRef.current = request
  useEffect(() => {
    mounted.current = true
    const offState = window.api.onBrowserState(receiveState)
    const offSelection = window.api.onBrowserSelection((next) => {
      if (next.workspaceId !== workspace.id) return
      setSelection(next); setInstruction(''); setSelectionOpen(true)
    })
    return () => {
      mounted.current = false
      offState(); offSelection()
      void window.api.browserRequest({ workspaceId: workspace.id, type: 'dispose' }).catch(() => {})
    }
  }, [workspace.id, receiveState])

  useEffect(() => window.api.onBrowserKey((key) => {
    if (!visible || overlays > 0 || key.workspaceId !== workspace.id) return
    if (key.address) { addressInput.current?.focus(); addressInput.current?.select(); return }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: key.key, code: key.code,
      ctrlKey: key.control, metaKey: key.meta, altKey: key.alt, shiftKey: key.shift, bubbles: true, cancelable: true }))
  }), [visible, overlays, workspace.id])

  const showPage = visible && overlays === 0 && !selectionOpen
  useEffect(() => {
    const id = workspace.id
    if (!showPage) { void requestRef.current({ workspaceId: id, type: 'hide' }); return }
    let frame = 0
    let previous = ''
    const update = (): void => {
      const rect = slot.current?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        const encoded = JSON.stringify(bounds)
        if (encoded !== previous) {
          previous = encoded
          const pending = browserLink && consumedLink.current !== browserLink ? browserLink : null
          void requestRef.current({ workspaceId: id, type: 'show', bounds, initialUrl: pending ? undefined : initialUrl }).then(() => {
            if (pending) return requestRef.current({ workspaceId: id, type: 'navigate', url: pending.url })
          })
          if (pending) consumedLink.current = pending
        }
      }
      frame = requestAnimationFrame(update)
    }
    update()
    return () => {
      cancelAnimationFrame(frame)
      void window.api.browserRequest({ workspaceId: id, type: 'hide' }).catch(() => {})
    }
  }, [workspace.id, showPage, initialUrl, browserLink])

  const navigate = (event: React.FormEvent): void => {
    event.preventDefault()
    try { void request({ workspaceId: workspace.id, type: 'navigate', url: browserUrl(address) }) }
    catch { setError(t('browser.invalidUrl')) }
  }
  return <div className="absolute inset-0 flex min-h-0 flex-col bg-panel" style={{ display: visible ? undefined : 'none' }}>
    <form onSubmit={navigate} className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-edge bg-bar p-2" aria-label={t('browser.navigation')}>
      <Button type="button" size="sm" variant="secondary" disabled={!state.canGoBack} title={t('browser.back')} aria-label={t('browser.back')}
        onClick={() => void request({ workspaceId: workspace.id, type: 'back' })}>←</Button>
      <Button type="button" size="sm" variant="secondary" disabled={!state.canGoForward} title={t('browser.forward')} aria-label={t('browser.forward')}
        onClick={() => void request({ workspaceId: workspace.id, type: 'forward' })}>→</Button>
      <Button type="button" size="sm" variant="secondary" disabled={!state.url} title={t('browser.reload')} aria-label={t('browser.reload')}
        onClick={() => void request({ workspaceId: workspace.id, type: 'reload' })}>↻</Button>
      <input ref={addressInput} aria-label={t('browser.address')} value={address} onChange={(event) => setAddress(event.target.value)} spellCheck={false}
        className="h-8 min-w-36 flex-1 rounded-md border border-edge bg-panel px-2 text-sm text-fg focus:outline-accent" />
      <Button type="submit" size="sm">{t('browser.go')}</Button>
      <Button type="button" size="sm" variant={state.designMode ? 'primary' : 'secondary'} aria-pressed={state.designMode}
        disabled={!state.url || state.url === 'about:blank' || state.loading || !!state.error}
        onClick={() => void request({ workspaceId: workspace.id, type: 'design', enabled: !state.designMode })}>Design Mode</Button>
      {selection && <Button type="button" size="sm" variant="secondary" onClick={() => setSelectionOpen(true)}>{t('browser.selected')}</Button>}
    </form>
    {state.designMode && <p className="shrink-0 border-b border-edge bg-accent/10 px-3 py-2 text-xs text-fg">{t('browser.pickHint')}</p>}
    {(error || state.error) && <p role="alert" className="shrink-0 border-b border-edge px-3 py-2 text-xs text-danger">{error || `${t('browser.loadFailed')} ${state.error}`}</p>}
    <div className="flex shrink-0 gap-2 border-b border-edge px-3 py-1 text-[11px] text-fgmuted" aria-live="polite">
      <span className="truncate">{state.loading ? t('browser.loading') : state.title || 'Browser'}</span>
    </div>
    <div ref={slot} className="relative min-h-0 flex-1 bg-white">
      {!state.url && <div className="flex h-full items-center justify-center bg-panel p-8 text-center text-sm text-fgmuted">{t('browser.empty')}</div>}
    </div>
    {visible && selectionOpen && selection && <DesignDialog selection={selection} instruction={instruction} onInstruction={setInstruction}
      targets={reviewTargets(sessions, workspace.id)} onClose={() => setSelectionOpen(false)} onSent={onSent} />}
  </div>
}

function DesignDialog({ selection, instruction, onInstruction, targets, onClose, onSent }: {
  selection: BrowserSelection; instruction: string; onInstruction: (text: string) => void
  targets: AgentSession[]; onClose: () => void; onSent: (session: AgentSession) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const [targetId, setTargetId] = useState(targets.length === 1 ? targets[0].id : '')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [error, setError] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const target = targets.find((item) => item.id === targetId)
  const send = async (): Promise<void> => {
    if (!target || !instruction.trim() || sendingRef.current) return
    sendingRef.current = true; setSending(true); setError(false)
    try {
      await window.api.sendDesign({ workspaceId: selection.workspaceId, selectionId: selection.id, sessionId: target.id, instruction })
      noteActivityInput(target.id)
      toast.success(t('browser.sent')); onClose(); onSent(target)
    } catch { setError(true) }
    finally { sendingRef.current = false; setSending(false) }
  }
  return <Modal title={t('browser.designTitle')} description={t('browser.designDescription')} size="xl" onClose={onClose}
    dismissable={!sending} initialFocusRef={input} footer={<><Button variant="secondary" disabled={sending} onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={sending} disabled={sending || !target || !instruction.trim()} onClick={() => void send()}>{t('review.send')}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-2 break-all text-xs text-fgmuted">{selection.selector}</p>
        <div className="flex max-h-60 justify-center overflow-auto rounded border border-edge bg-white p-2">
          <img src={selection.screenshot} alt={t('browser.screenshot')} className="max-w-full object-contain" />
        </div>
        <p className="my-2 break-all text-[11px] text-fgmuted">{selection.url}</p>
        <details className="rounded border border-edge p-2 text-xs text-fgdim"><summary className="cursor-pointer">HTML / CSS</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{selection.html}{'\n\n'}{selection.styles}</pre>
        </details>
      </div>
      <div className="min-w-0">
        <label className="block text-xs text-fgdim">{t('browser.instruction')}
          <textarea ref={input} value={instruction} onChange={(event) => onInstruction(event.target.value)} maxLength={10000} rows={6}
            className="mt-1 w-full resize-y rounded border border-edge bg-bar p-2 text-sm text-fg focus:outline-accent" />
        </label>
        <label className="mt-3 block text-xs text-fgdim">{t('review.target')}
          <Select className="mt-1" value={targetId} disabled={sending} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">{t('review.select')}</option>
            {targets.map((item) => <option key={item.id} value={item.id}>{item.label}{item.nickname ? ` — ${item.nickname}` : ''} · {item.id.slice(0, 8)}</option>)}
          </Select>
        </label>
        {!targets.length && <p className="mt-2 text-xs text-warn">{t('review.noAgents')}</p>}
        {error && <p role="alert" className="mt-2 text-xs text-danger">{t('review.failed')}</p>}
      </div>
    </div>
  </Modal>
}
