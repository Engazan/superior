import { useEffect, useId, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { describeIntegrationError, providerLabel } from '../integrations'
import type { CloneArgs, Integration, RemoteRepo } from '../types'

interface Props {
  integrations: Integration[]
  /** Open the native folder picker to add a local project. */
  onOpenFolder: () => void
  /** Resolves to a backend error code on failure, or null on success/cancel. */
  onClone: (args: CloneArgs) => Promise<string | null>
  /** Navigate to the integrations settings so the user can add a forge. */
  onAddIntegration: () => void
  onClose: () => void
}

type Source = 'local' | 'git'

export function OpenProjectModal({
  integrations,
  onOpenFolder,
  onClone,
  onAddIntegration,
  onClose
}: Props): JSX.Element {
  const { t } = useI18n()
  const titleId = useId()
  const [source, setSource] = useState<Source>('local')
  const [integrationId, setIntegrationId] = useState(integrations[0]?.id ?? '')
  const [repos, setRepos] = useState<RemoteRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [cloneError, setCloneError] = useState<string | null>(null)

  const hasIntegrations = integrations.length > 0

  useEffect(() => {
    const closeOnEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !cloningId) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, cloningId])

  // Load the selected integration's repositories whenever the git tab is active
  // and its integration changes.
  useEffect(() => {
    if (source !== 'git' || !integrationId) return
    let active = true
    setLoading(true)
    setListError(null)
    setRepos([])
    setCloneError(null)
    window.api.listRepos(integrationId).then((res) => {
      if (!active) return
      setLoading(false)
      if (res.error) setListError(res.error)
      else setRepos(res.repos)
    })
    return () => {
      active = false
    }
  }, [source, integrationId])

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

  const tabClass = (active: boolean): string =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active ? 'bg-accentBg text-accent ring-1 ring-inset ring-accentBorder' : 'text-fgdim hover:bg-hover hover:text-fg'
    }`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !cloningId) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-fg">
            {t('openProject.title')}
          </h2>
          <button
            onClick={() => !cloningId && onClose()}
            aria-label={t('integrations.cancel')}
            className="rounded-md p-1 text-fgdim transition hover:bg-hover hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-edge px-5 py-3">
          <button onClick={() => setSource('local')} className={tabClass(source === 'local')}>
            {t('openProject.thisPc')}
          </button>
          <button onClick={() => setSource('git')} className={tabClass(source === 'git')}>
            {t('openProject.fromGit')}
          </button>
        </div>

        {source === 'local' ? (
          <div className="flex flex-col items-start gap-3 px-5 py-6">
            <p className="text-sm text-fgmuted">{t('openProject.thisPcHint')}</p>
            <button
              onClick={openFolder}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bar transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t('openProject.chooseFolder')}
            </button>
          </div>
        ) : !hasIntegrations ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-fgmuted">{t('openProject.noIntegrations')}</p>
            <button
              onClick={onAddIntegration}
              className="rounded-lg border border-edge bg-bar px-4 py-2 text-sm font-medium text-fg transition hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t('openProject.addIntegration')}
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-edge px-5 py-3">
              <label className="mb-1.5 block text-xs font-medium text-fgdim">
                {t('clone.integration')}
              </label>
              <select
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                disabled={!!cloningId}
                className="w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accentBorder disabled:opacity-60"
              >
                {integrations.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} · {providerLabel(it.provider)}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('clone.search')}
                className="mt-2 w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fgmuted focus:border-accent focus:ring-2 focus:ring-accentBorder"
                spellCheck={false}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {loading && (
                <p className="px-3 py-6 text-center text-sm text-fgmuted">{t('clone.loading')}</p>
              )}
              {!loading && listError && (
                <p className="px-3 py-6 text-center text-sm text-red-400">
                  {describeIntegrationError(listError, t)}
                </p>
              )}
              {!loading && !listError && filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-fgmuted">{t('clone.noRepos')}</p>
              )}
              {!loading &&
                !listError &&
                filtered.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => clone(repo)}
                    disabled={!!cloningId}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-hover disabled:cursor-default disabled:opacity-50"
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
                      <span className="shrink-0 text-xs text-accent">{t('clone.cloning')}</span>
                    )}
                  </button>
                ))}
            </div>

            {cloneError && (
              <div className="border-t border-edge px-5 py-2 text-sm text-red-400">
                {describeIntegrationError(cloneError, t)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
