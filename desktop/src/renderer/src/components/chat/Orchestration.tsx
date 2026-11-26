import { useState } from 'react'
import type { ChatAction, NativeChat, WorkerSummary } from '@shared/native-chat'
import { useI18n } from '../../i18n'
import { BranchIcon, Button, Textarea } from '../ui'
import { PHASES, orchestrationPhases, type PhaseId } from '../../orchestrationPhase'

type Act = (action: ChatAction) => Promise<boolean>
type ChatStatus = NativeChat['status']

/** Spine and chip color per worker status: the same language as terminal panes. */
const STATUS_TONE: Record<ChatStatus, 'working' | 'attention' | 'done' | 'error' | 'muted'> = {
  working: 'working',
  waiting: 'attention',
  idle: 'done',
  interrupted: 'muted',
  error: 'error'
}

export function WorkerGrid({
  workers,
  chatId,
  act,
  busy,
  onOpen
}: {
  workers: WorkerSummary[]
  chatId: string
  act: Act
  busy: boolean
  onOpen: (workspaceId: string) => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <section className="space-y-2" aria-label={t('chat.workers')}>
      <h3 className="px-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fgmuted">
        {t('chat.workers')} · {workers.length}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} chatId={chatId} act={act} busy={busy} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function WorkerCard({
  worker,
  chatId,
  act,
  busy,
  onOpen
}: {
  worker: WorkerSummary
  chatId: string
  act: Act
  busy: boolean
  onOpen: (id: string) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [message, setMessage] = useState('')
  const tone = STATUS_TONE[worker.status]
  const live = worker.status === 'working' || worker.status === 'waiting'
  return (
    <article data-tone={tone} className="superior-worker-card flex flex-col gap-2.5 overflow-hidden rounded-xl border border-edge bg-panel p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{worker.title}</span>
        <span className="superior-worker-chip shrink-0 rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {worker.status}
        </span>
      </div>
      <p className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-fgmuted">
        <BranchIcon size={12} className="shrink-0" />
        <span className="truncate">{worker.branch ?? worker.id.slice(0, 8)}</span>
      </p>
      {worker.summary && (
        <details className="rounded-lg border border-edge bg-bar px-2.5 py-2">
          <summary className="cursor-pointer text-fgdim">{t('chat.result')}</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-fg2">{worker.summary}</pre>
        </details>
      )}
      <Textarea
        rows={2}
        maxLength={10000}
        value={message}
        placeholder={t('chat.messageWorker')}
        aria-label={t('chat.messageWorker')}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="xs"
          disabled={busy || !message.trim()}
          onClick={() =>
            void act({ type: 'message', id: chatId, to: worker.id, text: message }).then((ok) => {
              if (ok) setMessage('')
            })
          }
        >
          {t('chat.messageWorker')}
        </Button>
        <Button size="xs" variant="secondary" onClick={() => onOpen(worker.workspaceId)}>
          {t('chat.openWorker')}
        </Button>
        {live && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act({ type: 'stop', id: worker.id })}>
            {t('chat.stop')}
          </Button>
        )}
      </div>
    </article>
  )
}

/** Durable mail between coordinator and workers, newest first, as a timeline. */
export function InboxTimeline({
  inbox,
  workers
}: {
  inbox: NonNullable<NativeChat['inbox']>
  workers: WorkerSummary[]
}): React.JSX.Element {
  const { t } = useI18n()
  const sender = (from: string): string => workers.find((w) => w.id === from)?.title ?? from.slice(0, 8)
  const ordered = [...inbox].sort((a, b) => b.at - a.at)
  return (
    <details open className="rounded-xl border border-edge bg-panel p-3 text-xs">
      <summary className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.12em] text-fgmuted">
        {t('chat.inbox')} · {inbox.length}
      </summary>
      <ol className="mt-3 flex flex-col">
        {ordered.map((m, i) => (
          <li key={m.id} className="flex gap-3">
            <span aria-hidden className="flex flex-col items-center">
              <span className="mt-1 h-2 w-2 rounded-full bg-accent" />
              {i < ordered.length - 1 && <span className="w-px flex-1 bg-edge" />}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pb-3">
              <span className="font-mono text-[11px] text-fgmuted">
                {sender(m.from)} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="whitespace-pre-wrap break-words text-fg2">{m.text}</span>
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** Goal, four-phase stepper, controls and worker progress (top of the Orchestrate screen). */
export function CoordinatorHeader({
  chat,
  act,
  busy
}: {
  chat: NativeChat
  act: Act
  busy: boolean
}): React.JSX.Element {
  const { t } = useI18n()
  const workers = chat.workers ?? []
  const anyLive = chat.status === 'working' || chat.status === 'waiting' || workers.some((w) => w.status === 'working' || w.status === 'waiting')
  const goal = chat.items.find((item) => item.kind === 'user')?.text.split('\n')[0] ?? chat.title
  const phases = orchestrationPhases(chat)
  const [adding, setAdding] = useState(false)
  const liveWorkers = workers.filter((w) => w.status === 'working' || w.status === 'waiting').length
  const phaseLabel: Record<PhaseId, string> = {
    split: t('orchestrate.phaseSplit'),
    build: t('orchestrate.phaseBuild'),
    review: t('orchestrate.phaseReview'),
    merge: t('orchestrate.phaseMerge')
  }
  return (
    <section aria-label={t('chat.coordinator')} className="flex flex-col gap-3.5 rounded-[14px] border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent">{t('chat.coordinator')}</span>
        <span className="superior-worker-chip rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] uppercase" data-tone={STATUS_TONE[chat.status]}>
          {chat.status}
        </span>
        <span className="ml-auto flex gap-1.5">
          <Button size="xs" variant="secondary" disabled={busy || !anyLive} onClick={() => void act({ type: 'stop', id: chat.id })}>
            {t('orchestrate.pauseAll')}
          </Button>
          <Button size="xs" disabled={busy || liveWorkers >= 3} aria-expanded={adding} onClick={() => setAdding((v) => !v)}
            title={liveWorkers >= 3 ? t('orchestrate.addWorkerBusy') : undefined}>
            {t('orchestrate.addWorker')}
          </Button>
        </span>
      </div>
      <h2 className="m-0 line-clamp-2 text-xl font-bold tracking-tight text-fg">{goal}</h2>
      {adding && (
        <AddWorkerForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={(name, prompt) =>
            void act({ type: 'addWorker', id: chat.id, name, prompt }).then((ok) => {
              if (ok) setAdding(false)
            })
          }
        />
      )}
      <ol aria-label={t('orchestrate.phases')} className="grid grid-cols-4 gap-2">
        {PHASES.map((id, index) => (
          <li key={id} data-phase={phases[id]} aria-current={phases[id] === 'active' ? 'step' : undefined}
            className="superior-phase flex min-w-0 flex-col gap-1.5">
            <span aria-hidden className="h-1 rounded-full" />
            <span className="truncate text-xs">{index + 1} · {phaseLabel[id]}</span>
          </li>
        ))}
      </ol>
      {workers.length > 0 && (
        <ol aria-label={t('chat.workers')} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${workers.length}, minmax(0, 1fr))` }}>
          {workers.map((worker) => (
            <li key={worker.id} className="flex min-w-0 items-center gap-1.5" data-tone={STATUS_TONE[worker.status]}>
              <span aria-hidden className="superior-worker-progress h-2 w-2 shrink-0 rounded-full" />
              <span className="truncate text-[11px] text-fgmuted">{worker.title}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Name + task for a worker the user starts directly in its own worktree. */
function AddWorkerForm({
  busy,
  onSubmit,
  onCancel
}: {
  busy: boolean
  onSubmit: (name: string, prompt: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const ready = name.trim().length > 0 && prompt.trim().length > 0
  return (
    <form
      aria-label={t('orchestrate.addWorker')}
      className="flex flex-col gap-2 rounded-xl border border-accentBorder bg-accentBg p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !busy) onSubmit(name.trim(), prompt.trim())
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-fg2">
        {t('orchestrate.workerName')}
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="h-8 rounded-md border border-edge bg-panel px-2 text-sm text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-fg2">
        {t('orchestrate.workerTask')}
        <Textarea rows={3} value={prompt} maxLength={50000} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <p className="m-0 text-[11px] text-fgmuted">{t('orchestrate.workerHint')}</p>
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button size="xs" type="submit" disabled={busy || !ready}>{t('orchestrate.startWorker')}</Button>
      </div>
    </form>
  )
}

/** Goal for a new orchestration: creates a coordinator and sends the goal as its first message. */
export function GoalForm({
  busy,
  onSubmit,
  onCancel
}: {
  busy: boolean
  onSubmit: (goal: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [goal, setGoal] = useState('')
  return (
    <form
      aria-label={t('orchestrate.new')}
      className="flex flex-col gap-2 border-b border-edge bg-bar p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (goal.trim() && !busy) onSubmit(goal.trim())
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-fg2">
        {t('orchestrate.goal')}
        <Textarea autoFocus rows={3} value={goal} maxLength={100000} placeholder={t('orchestrate.goalPlaceholder')}
          onChange={(e) => setGoal(e.target.value)} />
      </label>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button size="sm" type="submit" disabled={busy || !goal.trim()}>{t('orchestrate.start')}</Button>
      </div>
    </form>
  )
}
