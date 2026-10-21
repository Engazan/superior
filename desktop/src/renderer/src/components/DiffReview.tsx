import { useRef, useState } from 'react'
import { buildReviewPrompt, MAX_REVIEW_TEXT, type ReviewAnchor, type ReviewNote } from '../diffReview'
import { useI18n } from '../i18n'
import { Button, Field, Modal, Notice, Select, Textarea, useToast } from './ui'
import type { AgentSession } from '../types'
import { noteActivityInput } from '../activityStore'

export function ReviewCommentEditor({ anchor, note, onSave, onClose }: {
  anchor: ReviewAnchor; note?: ReviewNote; onSave: (note: ReviewNote) => void; onClose: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [text, setText] = useState(note?.text ?? '')
  const input = useRef<HTMLTextAreaElement>(null)
  const save = (): void => {
    if (!text.trim()) return
    onSave({ ...anchor, id: note?.id ?? crypto.randomUUID(), text: text.trim() })
    onClose()
  }
  const lineLabel = t(anchor.line.type === 'del' ? 'review.oldLine' : 'review.newLine', { line: (anchor.line.type === 'del' ? anchor.line.oldLine : anchor.line.newLine) ?? '' })
  return <Modal title={t('review.comment')} description={<span className="break-all">{anchor.path} · {lineLabel}</span>}
    onClose={onClose} initialFocusRef={input} closeLabel={t('common.cancel')}
    footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
      <Button disabled={!text.trim()} onClick={save}>{t('common.save')}</Button></>}>
    <div className="space-y-5">
      <pre className="max-h-40 overflow-auto rounded-lg border border-edge bg-bar p-2 text-xs text-fgdim">{anchor.context}</pre>
      <Field label={t('review.feedback')} htmlFor="review-feedback">
        {/* Plain Enter inserts a newline; Cmd/Ctrl+Enter saves. */}
        <Textarea id="review-feedback" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_REVIEW_TEXT}
          rows={5}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); save() } }} />
      </Field>
    </div>
  </Modal>
}

export function DiffReview({ notes, onEdit, onRemove, targets, workspaceId, folderPath, onSent, storageFailed }: {
  notes: ReviewNote[]; onEdit: (note: ReviewNote) => void; onRemove: (id: string) => void
  targets: AgentSession[]; workspaceId: string; folderPath: string
  onSent: (session: AgentSession) => void; storageFailed: boolean
}): React.JSX.Element {
  const { t } = useI18n()
  const [sendingOpen, setSendingOpen] = useState(false)
  if (!notes.length) return <p className="border-b border-edge px-3 py-2 text-[11px] text-fgmuted">{t('review.hint')}</p>
  return <section className="shrink-0 border-b border-edge p-2" aria-label={t('review.title')}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-fg">{t('review.count', { count: notes.length })}</span>
      <Button size="sm" onClick={() => setSendingOpen(true)}>{t('review.send')}</Button>
    </div>
    <p className="mb-2 text-[11px] text-fgmuted">{t('review.snapshot')}</p>
    {storageFailed && <Notice tone="warn" className="mb-2">{t('review.storageFailed')}</Notice>}
    <ul className="max-h-44 space-y-2 overflow-y-auto">
      {notes.map((note) => <li key={note.id} className="rounded-md border border-edge p-2 text-xs">
        <button type="button" className="w-full rounded-sm text-left transition hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50" onClick={() => onEdit(note)} title={t('review.edit')}>
          <span className="block break-all text-fgmuted">{note.path} · {t(note.line.type === 'del' ? 'review.oldLine' : 'review.newLine', { line: (note.line.type === 'del' ? note.line.oldLine : note.line.newLine) ?? '' })} · {t(note.section === 'staged' ? 'changes.staged' : 'changes.unstaged')}</span>
          <span className="mt-1 block whitespace-pre-wrap break-words text-fg">{note.text}</span>
        </button>
        <button type="button" className="mt-1 rounded-sm text-fgmuted transition hover:text-danger focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50" onClick={() => onRemove(note.id)}>{t('review.remove')}</button>
      </li>)}
    </ul>
    {sendingOpen && <ReviewSendDialog notes={notes} targets={targets} workspaceId={workspaceId} folderPath={folderPath}
      onClose={() => setSendingOpen(false)} onSent={onSent} />}
  </section>
}

function ReviewSendDialog({ notes, targets, workspaceId, folderPath, onClose, onSent }: {
  notes: ReviewNote[]; targets: AgentSession[]; workspaceId: string; folderPath: string
  onClose: () => void; onSent: (session: AgentSession) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const [targetId, setTargetId] = useState(targets.length === 1 ? targets[0].id : '')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [error, setError] = useState(false)
  const prompt = buildReviewPrompt(folderPath, notes)
  const target = targets.find((session) => session.id === targetId)
  const send = async (): Promise<void> => {
    if (!target || sendingRef.current) return
    sendingRef.current = true
    setSending(true); setError(false)
    try {
      await window.api.sendReview({ sessionId: target.id, workspaceId, folderPath, prompt })
      noteActivityInput(target.id)
      toast.success(t('review.sent'))
      onClose()
      onSent(target)
    } catch { setError(true) }
    finally { sendingRef.current = false; setSending(false) }
  }
  return <Modal title={t('review.send')} description={t('review.sendHint')} onClose={onClose} dismissable={!sending}
    closeLabel={t('common.cancel')}
    size="lg" footer={<><Button variant="ghost" disabled={sending} onClick={onClose}>{t('common.cancel')}</Button>
      <Button disabled={!target} loading={sending} onClick={() => void send()}>{t('review.send')}</Button></>}>
    <div className="space-y-5">
      <Field label={t('review.target')} htmlFor="review-target">
        <Select id="review-target" value={targetId} disabled={sending || !targets.length} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">{t('review.select')}</option>
          {targets.map((session) => <option key={session.id} value={session.id}>
            {session.nickname ? `${session.label} — ${session.nickname}` : session.label} · {session.id.slice(0, 8)}
          </option>)}
        </Select>
      </Field>
      {!targets.length && <Notice tone="warn">{t('review.noAgents')}</Notice>}
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-edge bg-bar p-3 text-xs text-fgdim">{prompt}</pre>
      {error && <Notice>{t('review.failed')}</Notice>}
    </div>
  </Modal>
}
