import { useEffect, useState } from 'react'
import type { WorktreeSetupSnapshot } from '@shared/worktree-setup'
import type { Workspace } from '../types'
import { ipcErrorMessage } from '../ipcError'
import { useI18n } from '../i18n'
import { Button, Modal } from './ui'

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
        footer={editing ? <>
          {workspace.worktreePath && <Button variant="secondary" onClick={() => setEditing(false)}>{t('setup.details')}</Button>}
          <Button disabled={busy || (!snapshot && !error)} onClick={save}>{t('setup.save')}</Button>
        </> : <>
          <Button variant="secondary" onClick={edit}>{t('setup.configure')}</Button>
          {workspace.worktreePath && (running
            ? <Button disabled={busy} variant="secondary" onClick={() => void action(() => window.api.cancelWorktreeSetup(workspace.id))}>{t('setup.cancel')}</Button>
            : <Button disabled={busy} onClick={() => void action(() => window.api.retryWorktreeSetup(workspace.id))}>{t(state?.status === 'failed' ? 'setup.retry' : 'setup.run')}</Button>)}
        </>}>
        <div className="space-y-4">
          {editing ? <>
            <p className="text-sm text-fgdim">{t('setup.description')}</p>
            <label className="block text-sm" htmlFor="setup-commands">{t('setup.commands')}</label>
            <textarea id="setup-commands" className="w-full rounded border border-edge bg-base p-2 font-mono text-xs text-fg" rows={5}
              value={commands} onChange={e => setCommands(e.target.value)} placeholder={'npm ci\nnpm run build'} />
            <label className="block text-sm" htmlFor="setup-files">{t('setup.files')}</label>
            <textarea id="setup-files" className="w-full rounded border border-edge bg-base p-2 font-mono text-xs text-fg" rows={3}
              value={files} onChange={e => setFiles(e.target.value)} placeholder={'.env.local\nconfig/local.json'} />
            <p className="text-xs text-fgdim">{t('setup.copyHint')}</p>
          </> : <>
            <p role="status" className="text-sm text-fgdim">{t(`setup.${status}`)}</p>
            {state?.step && <p className="break-words font-mono text-xs text-fgdim">{state.step}</p>}
            {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
            <pre aria-label={t('setup.output')} className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-base p-3 font-mono text-xs text-fg">{state?.output || t('setup.noOutput')}</pre>
            <p className="text-xs text-fgdim">{t('setup.retryHint')}</p>
          </>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
    </Modal>
  )
}
