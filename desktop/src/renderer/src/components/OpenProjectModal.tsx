import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { describeIntegrationError, providerLabel } from '../integrations'
import {
  Button,
  EmptyState,
  Field,
  FieldTag,
  Input,
  Modal,
  Notice,
  SegmentedControl,
  Select
} from './ui'
import type { CloneArgs, Integration, RemoteFolderAddArgs, RemoteRepo } from '../types'

interface Props {
  integrations: Integration[]
  /** Open the native folder picker to add a local project. */
  onOpenFolder: () => void
  /** Resolves to a backend error code on failure, or null on success/cancel. */
  onClone: (args: CloneArgs) => Promise<string | null>
  /** Add an SSH-backed remote workspace. Resolves to a user-facing error, or null. */
  onAddRemote: (args: RemoteFolderAddArgs) => Promise<string | null>
  /** Navigate to the integrations settings so the user can add a forge. */
  onAddIntegration: () => void
  onClose: () => void
  /** Optional tab selected by an empty-state action. */
  initialSource?: Source
}

type Source = 'local' | 'git' | 'remote'

export function OpenProjectModal({
  integrations,
  onOpenFolder,
  onClone,
  onAddRemote,
  onAddIntegration,
  onClose,
  initialSource = 'local'
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const remoteFormId = useId()
  const [source, setSource] = useState<Source>(initialSource)
  const [integrationId, setIntegrationId] = useState(integrations[0]?.id ?? '')
  const [repos, setRepos] = useState<RemoteRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [remoteHost, setRemoteHost] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [remoteName, setRemoteName] = useState('')
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [remoteTesting, setRemoteTesting] = useState(false)
  const [remoteOk, setRemoteOk] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const repoRequestRef = useRef(0)

  const hasIntegrations = integrations.length > 0
  // While a clone/remote request is in flight the modal can't be dismissed.
  const busy = !!cloningId || remoteBusy || remoteTesting
  const remoteReady = !!remoteHost.trim() && !!remotePath.trim()

  // Load the selected integration's repositories whenever the git tab is active
  // and its integration changes.
  const loadRepositories = useCallback((): void => {
    if (source !== 'git' || !integrationId) return
    const request = ++repoRequestRef.current
    setLoading(true)
    setListError(null)
    setRepos([])
    setCloneError(null)
    void window.api
      .listRepos(integrationId)
      .then((res) => {
        if (request !== repoRequestRef.current) return
        setLoading(false)
        if (res.error) setListError(res.error)
        else setRepos(res.repos)
      })
      .catch((err: Error) => {
        // A rejected IPC would otherwise leave the list on "Loading…" forever.
        if (request !== repoRequestRef.current) return
        setLoading(false)
        setListError(err.message)
      })
  }, [source, integrationId])

  useEffect(() => loadRepositories(), [loadRepositories])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return repos
    return repos.filter((r) => r.fullName.toLowerCase().includes(q))
  }, [repos, query])

  const openFolder = (): void => {
    onOpenFolder()
    onClose()
  }

  const clone = async (repo: RemoteRepo): Promise<void> => {
    setCloningId(repo.id)
    setCloneError(null)
    const err = await onClone({ integrationId, cloneUrl: repo.cloneUrl, fullName: repo.fullName })
    setCloningId(null)
    if (err) setCloneError(err)
    else onClose()
  }

  const remoteArgs = (): RemoteFolderAddArgs => ({
    host: remoteHost.trim(),
    path: remotePath.trim(),
    name: remoteName.trim() || undefined
  })

  const testRemote = async (): Promise<void> => {
    setRemoteTesting(true)
    setRemoteError(null)
    setRemoteOk(false)
    const res = await window.api.testRemoteFolder(remoteArgs())
    setRemoteTesting(false)
    if (res.ok) setRemoteOk(true)
    else setRemoteError(res.error)
  }

  const addRemote = async (): Promise<void> => {
    if (!remoteReady || busy) return
    setRemoteBusy(true)
    setRemoteError(null)
    setRemoteOk(false)
    const err = await onAddRemote(remoteArgs())
    setRemoteBusy(false)
    if (err) setRemoteError(err)
    else onClose()
  }

  const cancel = (
    <Button variant="ghost" disabled={busy} onClick={onClose}>
      {t('common.cancel')}
    </Button>
  )

  const footer =
    source === 'local' ? (
      <>
        {cancel}
        <Button onClick={openFolder}>{t('openProject.chooseFolder')}</Button>
      </>
    ) : source === 'remote' ? (
      <>
        {cancel}
        <Button
          variant="secondary"
          loading={remoteTesting}
          disabled={remoteBusy || !remoteReady}
          onClick={() => void testRemote()}
        >
          {t('remote.test')}
        </Button>
        <Button
          type="submit"
          form={remoteFormId}
          loading={remoteBusy}
          disabled={remoteTesting || !remoteReady}
        >
          {t('remote.add')}
        </Button>
      </>
    ) : (
      cancel
    )

  return (
    <Modal
      size="lg"
      title={t('openProject.title')}
      onClose={() => !busy && onClose()}
      closeLabel={t('common.cancel')}
      dismissable={!busy}
      footer={footer}
    >
      <div className="space-y-5">
        <SegmentedControl
          fill
          aria-label={t('openProject.title')}
          value={source}
          onChange={setSource}
          options={[
            { value: 'local', label: t('openProject.thisPc') },
            { value: 'git', label: t('openProject.fromGit') },
            { value: 'remote', label: t('openProject.remoteSsh') }
          ]}
        />

        {source === 'local' ? (
          <p className="text-xs leading-5 text-fgdim">{t('openProject.thisPcHint')}</p>
        ) : source === 'remote' ? (
          <form
            id={remoteFormId}
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              void addRemote()
            }}
          >
            <p className="text-xs leading-5 text-fgdim">{t('remote.hint')}</p>
            <Field label={t('remote.host')} htmlFor="remote-host">
              <Input
                id="remote-host"
                autoFocus
                value={remoteHost}
                onChange={(event) => {
                  setRemoteHost(event.target.value)
                  setRemoteOk(false)
                  setRemoteError(null)
                }}
                placeholder={t('remote.hostPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label={t('remote.path')} htmlFor="remote-path">
              <Input
                id="remote-path"
                value={remotePath}
                onChange={(event) => {
                  setRemotePath(event.target.value)
                  setRemoteOk(false)
                  setRemoteError(null)
                }}
                placeholder={t('remote.pathPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field
              label={t('remote.name')}
              htmlFor="remote-name"
              aside={<FieldTag>{t('worktree.optional')}</FieldTag>}
            >
              <Input
                id="remote-name"
                value={remoteName}
                onChange={(event) => setRemoteName(event.target.value)}
                placeholder={t('remote.namePlaceholder')}
                autoComplete="off"
              />
            </Field>
            {remoteError && <Notice>{remoteError}</Notice>}
            {remoteOk && <Notice tone="success">{t('remote.testOk')}</Notice>}
          </form>
        ) : !hasIntegrations ? (
          <EmptyState
            title={t('openProject.noIntegrations')}
            action={
              <Button size="sm" variant="secondary" onClick={onAddIntegration}>
                {t('openProject.addIntegration')}
              </Button>
            }
          />
        ) : (
          <>
            <Field label={t('clone.integration')} htmlFor="clone-integration">
              <Select
                id="clone-integration"
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                disabled={!!cloningId}
              >
                {integrations.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} · {providerLabel(it.provider)}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-2">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('clone.search')}
                aria-label={t('clone.search')}
                spellCheck={false}
              />
              {/* Own scroll box so the search field stays put above a long list. */}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-edge p-1">
                {loading && (
                  <p className="px-3 py-6 text-center text-sm text-fgmuted">{t('clone.loading')}</p>
                )}
                {!loading && listError && (
                  <div className="p-2">
                    <Notice
                      action={
                        <div className="flex flex-col items-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={loadRepositories}>
                            {t('clone.retry')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={onAddIntegration}>
                            {t('clone.openIntegrationSettings')}
                          </Button>
                        </div>
                      }
                    >
                      {describeIntegrationError(listError, t)}
                    </Notice>
                  </div>
                )}
                {!loading && !listError && filtered.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-fgmuted">{t('clone.noRepos')}</p>
                )}
                {!loading &&
                  !listError &&
                  filtered.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => void clone(repo)}
                      disabled={!!cloningId}
                      aria-busy={cloningId === repo.id || undefined}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-fg">{repo.fullName}</span>
                          {repo.private && (
                            <span className="shrink-0 rounded-full bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fgdim">
                              {t('clone.private')}
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <div className="truncate text-xs text-fgmuted">{repo.description}</div>
                        )}
                      </div>
                      {cloningId === repo.id && (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-accent">
                          <span
                            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                            aria-hidden
                          />
                          {t('clone.cloning')}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {cloneError && <Notice>{describeIntegrationError(cloneError, t)}</Notice>}
          </>
        )}
      </div>
    </Modal>
  )
}
