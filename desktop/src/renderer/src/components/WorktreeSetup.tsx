import { useEffect, useState } from 'react'
import type { WorktreeSetupSnapshot } from '@shared/worktree-setup'
import type { Workspace } from '../types'
import { ipcErrorMessage } from '../ipcError'
import { useI18n } from '../i18n'
import { Button, Field, Modal, Notice, StatusPill, Textarea } from './ui'

const STATUS_TONE = {
  pending: 'accent',
  running: 'accent',
  ready: 'success',
  failed: 'danger',
  unprepared: 'neutral'
} as const

/** Keyed by workspace by the caller: drafts/results never bleed between projects. */
export function WorktreeSetup({ workspace, onClose }: { workspace: Workspace; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<WorktreeSetupSnapshot | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(true)
  const [commands, setCommands] = useState('')
  const [files, setFiles] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let disposed = false
    let initialized = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async (): Promise<void> => {
      try {
        const next = await window.api.getWorktreeSetup(workspace.id)
        if (!disposed) {
          setSnapshot(next)
          if (!initialized) {
            setCommands(next.config.commands.join('\n'))
            setFiles(next.config.copyFiles.join('\n'))
            initialized = true
          }
        }
      } catch (err) {
        if (!disposed) setError(ipcErrorMessage(err))
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 1000)
      }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [workspace.id])

  const state = snapshot?.state
  const running = state?.status === 'running' || state?.status === 'pending'
  const status = state?.status ?? 'unprepared'
  // The first poll hasn't answered yet: the textareas would show empty drafts.
  const loading = !snapshot && !error
  const edit = (): void => {
    setCommands(snapshot?.config.commands.join('\n') ?? '')
    setFiles(snapshot?.config.copyFiles.join('\n') ?? '')
    setEditing(true)
  }
  const action = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await fn()
      setSnapshot(await window.api.getWorktreeSetup(workspace.id))
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally { setBusy(false) }
  }
  const save = (): void => {
    if (busy || loading) return
    void action(async () => {
      await window.api.saveWorktreeSetup(workspace.id, {
        commands: commands.split('\n').map(s => s.trim()).filter(Boolean),
        copyFiles: files.split('\n').map(s => s.trim()).filter(Boolean)
      })
      setEditing(false)
      if (!workspace.worktreePath) onClose()
    })
  }

  return (
    <Modal size="lg" title={editing ? t('setup.configure') : t('setup.title')} onClose={onClose}
        closeLabel={t('common.cancel')}
        footer={editing ? <>
          {workspace.worktreePath
            ? <Button variant="ghost" onClick={() => setEditing(false)}>{t('setup.details')}</Button>
            : <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>}
          <Button type="submit" form="worktree-setup-form" loading={busy} disabled={loading}>{t('setup.save')}</Button>
        </> : <>
          <Button variant="ghost" onClick={edit}>{t('setup.configure')}</Button>
          {workspace.worktreePath && (running
            ? <Button loading={busy} variant="secondary" onClick={() => void action(() => window.api.cancelWorktreeSetup(workspace.id))}>{t('setup.cancel')}</Button>
            : <Button loading={busy} onClick={() => void action(() => window.api.retryWorktreeSetup(workspace.id))}>{t(state?.status === 'failed' ? 'setup.retry' : 'setup.run')}</Button>)}
        </>}>
        {editing ? (
          <form id="worktree-setup-form" className="space-y-5"
            onSubmit={(e) => { e.preventDefault(); save() }}>
            <p className="text-xs leading-5 text-fgdim">{t('setup.description')}</p>
            <Field label={t('setup.commands')} htmlFor="setup-commands">
              <Textarea id="setup-commands" className="font-mono text-xs" rows={5} spellCheck={false}
                disabled={loading} value={commands} onChange={e => setCommands(e.target.value)}
                placeholder={loading ? t('common.loading') : 'npm ci\nnpm run build'} />
            </Field>
            <Field label={t('setup.files')} htmlFor="setup-files" hint={t('setup.copyHint')}>
              <Textarea id="setup-files" className="font-mono text-xs" rows={3} spellCheck={false}
                disabled={loading} value={files} onChange={e => setFiles(e.target.value)}
                placeholder={loading ? t('common.loading') : '.env.local\nconfig/local.json'} />
            </Field>
            {error && <Notice>{error}</Notice>}
          </form>
        ) : (
          <div className="space-y-4">
            <div role="status" className="flex flex-wrap items-center gap-2">
              <StatusPill tone={STATUS_TONE[status]} dot>{t(`setup.${status}`)}</StatusPill>
              {state?.step && <span className="min-w-0 break-words font-mono text-xs text-fgdim">{state.step}</span>}
            </div>
            {state?.error && <Notice>{state.error}</Notice>}
            <pre aria-label={t('setup.output')} className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-edge bg-base p-3 font-mono text-xs text-fg">{state?.output || t('setup.noOutput')}</pre>
            <p className="text-xs text-fgmuted">{t('setup.retryHint')}</p>
            {error && <Notice>{error}</Notice>}
          </div>
        )}
    </Modal>
  )
}
