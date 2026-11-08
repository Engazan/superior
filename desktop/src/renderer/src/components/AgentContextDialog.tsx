import { useEffect, useRef, useState } from 'react'
import { AGENT_CONTEXT_EVENT, contextPrompt, type AgentContext } from '../agentContext'
import { reviewTargets } from '../diffReview'
import { noteActivityInput } from '../activityStore'
import { useI18n } from '../i18n'
import type { AgentSession, Workspace } from '../types'
import { Button, Field, Modal, Notice, Select, Textarea } from './ui'

export function AgentContextHost({ workspace, workspaces, sessions }: {
  workspace: Workspace | null | undefined; workspaces: Workspace[]; sessions: AgentSession[]
}): React.JSX.Element | null {
  const [request, setRequest] = useState<{ context: AgentContext; workspace: Workspace } | null>(null)
  useEffect(() => {
    const receive = (event: Event): void => {
      const context = (event as CustomEvent<AgentContext>).detail
      const target = context.workspaceId ? workspaces.find(w => w.id === context.workspaceId) : workspace
      if (target && context.text.length <= 100_000) setRequest({ context, workspace: target })
    }
    window.addEventListener(AGENT_CONTEXT_EVENT, receive)
    return () => window.removeEventListener(AGENT_CONTEXT_EVENT, receive)
  }, [workspace, workspaces])
  return request ? <ContextDialog key={JSON.stringify(request)} {...request} sessions={sessions} onClose={() => setRequest(null)} /> : null
}
function ContextDialog({ context, workspace, sessions, onClose }: {
  context: AgentContext; workspace: Workspace; sessions: AgentSession[]; onClose: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const targets = reviewTargets(sessions, workspace.id)
  const [targetId, setTargetId] = useState(targets.length === 1 ? targets[0].id : '')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const lock = useRef(false)
  const target = targets.find(s => s.id === targetId)
  const send = async (): Promise<void> => {
    if (!target || !instruction.trim() || lock.current) return
    lock.current = true; setBusy(true); setFailed(false)
    try {
      await window.api.sendReview({ sessionId: target.id, workspaceId: workspace.id,
        folderPath: workspace.worktreePath ?? workspace.folderPath, prompt: contextPrompt(context, instruction) })
      noteActivityInput(target.id)
      onClose()
    } catch { setFailed(true) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Modal title={t('context.send')} description={`${workspace.name} · ${workspace.branch ?? workspace.folderPath}`}
    onClose={onClose} dismissable={!busy} closeLabel={t('common.cancel')}
    footer={<Button disabled={!target || !instruction.trim()} loading={busy} onClick={() => void send()}>{t('context.send')}</Button>}>
    <div className="space-y-4">
      <Field label={t('review.target')} htmlFor="context-target"><Select id="context-target" value={targetId} disabled={busy} onChange={e => setTargetId(e.target.value)}>
        <option value="">{t('review.select')}</option>{targets.map(s => <option key={s.id} value={s.id}>{s.nickname ?? s.label} · {s.id.slice(0, 8)}</option>)}
      </Select></Field>
      {!targets.length && <Notice tone="warn">{t('review.noAgents')}</Notice>}
      <Field label={t('context.instruction')} htmlFor="context-instruction"><Textarea id="context-instruction" value={instruction} disabled={busy} maxLength={10000} rows={3} onChange={e => setInstruction(e.target.value)} /></Field>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-edge p-3 text-xs">{contextPrompt(context, instruction)}</pre>
      {failed && <Notice>{t('review.failed')}</Notice>}
    </div>
  </Modal>
}
