import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatAction, ChatApproval, NativeChat, NativeChatSummary, WorkerSummary } from '@shared/native-chat'
import type { Workspace } from '../types'
import { useI18n } from '../i18n'
import { Button, Notice, Select, Textarea } from './ui'

export function NativeChatWorkspace({ workspace, onOpenWorker }: { workspace: Workspace; onOpenWorker: (workspaceId: string) => void }): React.JSX.Element {
  const { t } = useI18n()
  const [chats, setChats] = useState<NativeChatSummary[]>([])
  const [detail, setDetail] = useState<NativeChat | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const selectedId = chats.some(c => c.id === selected) ? selected : chats.at(-1)?.id
  const chat = detail?.id === selectedId ? detail : null
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async (): Promise<void> => {
      try {
        const next = await window.api.listNativeChats(workspace.id)
        const id = next.some(c => c.id === selected) ? selected : next.at(-1)?.id
        const nextDetail = id ? await window.api.getNativeChat(id) : null
        if (active) { setChats(next); setDetail(nextDetail) }
      }
      catch (e) { if (active) setError(String(e)) }
      if (active) timer = setTimeout(() => void refresh(), 500)
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [workspace.id, selected])
  const act = async (action: ChatAction): Promise<boolean> => {
    if (locked.current) return false
    locked.current = true; setBusy(true); setError('')
    try {
      const result = await window.api.nativeChatAction(action)
      if (result && result.workspaceId === workspace.id) { setSelected(result.id); setDetail(result) }
      setChats(await window.api.listNativeChats(workspace.id))
      return true
    } catch (e) { setError(String(e)); return false }
    finally { locked.current = false; setBusy(false) }
  }
  return <div className="flex h-full min-w-0 flex-1 flex-col bg-panel">
    <div className="flex shrink-0 items-center gap-2 border-b border-edge p-2">
      <Select aria-label="Chat" value={chat?.id ?? ''} onChange={e => setSelected(e.target.value)} className="min-w-0 flex-1">
        {!chats.length && <option value="">Codex</option>}{chats.map(c => <option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}
      </Select>
      <Button size="sm" disabled={busy} onClick={() => void act({ type: 'create', workspaceId: workspace.id })}>{t('chat.new')}</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ type: 'create', workspaceId: workspace.id, coordinator: true })}>{t('chat.coordinator')}</Button>
      {chat && <Button variant="ghost" size="sm" disabled={busy || chat.status === 'working' || chat.status === 'waiting'} onClick={() => void act({ type: 'delete', id: chat.id })}>{t('review.remove')}</Button>}
    </div>
    {error && <Notice>{error}</Notice>}
    {chat ? <ChatBody key={chat.id} chat={chat} workspace={workspace} act={act} busy={busy} onOpenWorker={onOpenWorker} />
      : <p className="p-6 text-sm text-fgmuted">{t('chat.intro')}</p>}
  </div>
}
function ChatBody({ chat, workspace, act, busy, onOpenWorker }: { chat: NativeChat; workspace: Workspace; act: (action: ChatAction) => Promise<boolean>; busy: boolean; onOpenWorker: (workspaceId: string) => void }): React.JSX.Element {
  const { t } = useI18n()
  const draftKey = `superior.chat.draft.${chat.id}`
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) ?? '' } catch { return '' } })
  const [plan, setPlan] = useState(chat.plan)
  const running = chat.status === 'working' || chat.status === 'waiting'
  const bottom = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => { if (following.current) bottom.current?.scrollIntoView({ block: 'end' }) }, [chat.items, chat.approvals])
  const draft = (next: string): void => {
    setText(next)
    try { if (next) localStorage.setItem(draftKey, next); else localStorage.removeItem(draftKey); setStorageError(false) } catch { setStorageError(true) }
  }
  const send = async (): Promise<void> => {
    if (!text.trim() || running || busy) return
    if (await act({ type: 'send', id: chat.id, text, plan })) draft('')
  }
  return <>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" onScroll={e => { const el = e.currentTarget; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }}>
      {!!chat.workers?.length && <section className="space-y-2"><h3 className="text-sm font-medium">{t('chat.workers')}</h3>{chat.workers.map(worker => <WorkerCard key={worker.id} worker={worker} chatId={chat.id} act={act} busy={busy} onOpen={onOpenWorker} />)}</section>}
      {!!chat.inbox?.length && <details className="rounded border border-edge p-2 text-xs"><summary>{t('chat.inbox')} ({chat.inbox.length})</summary>{chat.inbox.map(m => <p key={m.id} className="whitespace-pre-wrap py-1">{m.from.slice(0, 8)} · {m.text}</p>)}</details>}
      {chat.items.map(item => <article key={item.id} className="rounded-lg border border-edge p-3 text-sm">
        <div className="mb-2 text-xs text-fgmuted">{item.kind} · {item.title}{!item.complete ? ' …' : ''}</div>
        {item.kind === 'tool' ? <details><summary className="cursor-pointer">{item.text.split('\n')[0].slice(0, 160)}</summary><pre className="overflow-auto whitespace-pre-wrap break-words text-xs">{item.text}</pre></details>
          : <div className="min-w-0 break-words text-fg [&_p]:my-2 [&_h1]:my-3 [&_h1]:text-xl [&_h2]:my-3 [&_h2]:text-lg [&_h3]:my-2 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-app [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-edge [&_blockquote]:pl-3 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-edge [&_td]:p-2 [&_th]:border [&_th]:border-edge [&_th]:p-2"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown></div>}
        {item.kind === 'assistant' && item.complete && !running && <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act({ type: 'fork', id: chat.id, turnId: item.turnId })}>{t('chat.fork')}</Button>}
      </article>)}
      {chat.approvals.map(approval => <Approval key={approval.id} approval={approval} chatId={chat.id} act={act} busy={busy} />)}
      {chat.error && <Notice>{chat.error}</Notice>}
      <div ref={bottom} />
    </div>
    <div className="shrink-0 space-y-2 border-t border-edge p-3">
      <p className="text-xs text-fgmuted">{workspace.name} · {workspace.branch ?? chat.cwd} · Codex · {chat.status}</p>
      {storageError && <Notice>{t('review.storageFailed')}</Notice>}
      <Textarea rows={3} value={text} maxLength={100000} disabled={busy} aria-label={t('context.instruction')} onChange={e => draft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
      <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={plan} disabled={busy || running} onChange={e => setPlan(e.target.checked)} />Plan mode</label>
        {(running || chat.workers?.some(w => w.status === 'working' || w.status === 'waiting')) ? <Button disabled={busy} onClick={() => void act({ type: 'stop', id: chat.id })}>{t('chat.stop')}</Button>
          : <Button disabled={busy || !text.trim()} onClick={() => void send()}>{t('context.send')}</Button>}
      </div>
    </div>
  </>
}
function Approval({ approval, chatId, act, busy }: { approval: ChatApproval; chatId: string; act: (action: ChatAction) => Promise<boolean>; busy: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  return <section className="space-y-3 rounded-lg border border-accent p-3" aria-label={t('chat.approval')}>
    <p className="font-medium">{approval.title}</p>
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{approval.detail}</pre>
    {approval.questions?.map(q => <label key={q.id} className="block text-sm">{q.question}
      {!!q.options.length && <Select value={answers[q.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}><option value="">—</option>{q.options.map(o => <option key={o}>{o}</option>)}</Select>}
      <input className="mt-1 block w-full rounded border border-edge bg-panel p-2" type={q.secret ? 'password' : 'text'} value={answers[q.id] ?? ''} maxLength={10000} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
    </label>)}
    <div className="flex gap-2">{approval.kind === 'question'
      ? <Button disabled={busy || approval.questions?.some(q => !answers[q.id]?.trim())} onClick={() => void act({ type: 'answer', id: chatId, requestId: approval.id, answers })}>{t('context.send')}</Button>
      : <><Button disabled={busy} onClick={() => void act({ type: 'answer', id: chatId, requestId: approval.id, decision: 'accept' })}>{t('chat.approve')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void act({ type: 'answer', id: chatId, requestId: approval.id, decision: 'decline' })}>{t('chat.decline')}</Button></>}
    </div>
  </section>
}

function WorkerCard({ worker, chatId, act, busy, onOpen }: { worker: WorkerSummary; chatId: string; act: (action: ChatAction) => Promise<boolean>; busy: boolean; onOpen: (id: string) => void }): React.JSX.Element {
  const { t } = useI18n()
  const [message, setMessage] = useState('')
  return <article className="space-y-2 rounded border border-edge p-2 text-xs">
    <div className="flex items-center justify-between"><span>{worker.title} · {worker.status}</span><Button size="xs" variant="ghost" onClick={() => onOpen(worker.workspaceId)}>{t('chat.openWorker')}</Button></div>
    <p className="break-all text-fgmuted">{worker.branch} · {worker.id.slice(0, 8)}</p>
    {worker.summary && <details><summary>{t('chat.result')}</summary><pre className="whitespace-pre-wrap break-words">{worker.summary}</pre></details>}
    <Textarea rows={2} maxLength={10000} value={message} aria-label={t('chat.messageWorker')} onChange={e => setMessage(e.target.value)} />
    <div className="flex gap-2"><Button size="xs" disabled={busy || !message.trim()} onClick={() => void act({ type: 'message', id: chatId, to: worker.id, text: message }).then(ok => { if (ok) setMessage('') })}>{t('chat.messageWorker')}</Button>
      {['working', 'waiting'].includes(worker.status) && <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act({ type: 'stop', id: worker.id })}>{t('chat.stop')}</Button>}
    </div>
  </article>
}
