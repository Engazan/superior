import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import {
  INTEGRATION_PROVIDERS,
  describeIntegrationError,
  providerLabel,
  providerLogo
} from '../integrations'
import type { Integration, IntegrationProvider, IntegrationTestResult } from '../types'

const INPUT_CLASS =
  'w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accentBorder'

/** A blank draft for the "add integration" form. */
function emptyDraft(): Integration {
  return { id: '', provider: 'gitea', name: '', baseUrl: '', token: '' }
}

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'done'; result: IntegrationTestResult }

function ProviderLogo({
  provider,
  className = 'h-9 w-9'
}: {
  provider: IntegrationProvider
  className?: string
}): JSX.Element {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-edge bg-panel shadow-sm ${className}`}
      title={providerLabel(provider)}
    >
      <img
        src={providerLogo(provider)}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  )
}

function IntegrationForm({
  initial,
  onSave,
  onCancel
}: {
  initial: Integration
  onSave: (integration: Integration) => void
  onCancel: () => void
}): JSX.Element {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Integration>(initial)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  const patch = (p: Partial<Integration>): void => {
    setDraft((d) => ({ ...d, ...p }))
    setTest({ phase: 'idle' })
  }

  const urlRequired = draft.provider !== 'github'
  const canSave = draft.name.trim() && draft.token.trim() && (!urlRequired || draft.baseUrl.trim())

  const runTest = async (): Promise<void> => {
    setTest({ phase: 'testing' })
    const result = await window.api.testIntegration({
      provider: draft.provider,
      baseUrl: draft.baseUrl,
      token: draft.token
    })
    setTest({ phase: 'done', result })
  }

  return (
    <div className="rounded-xl border border-edge bg-bar p-4">
      <div className="grid gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.provider')}
          </label>
          <div className="flex items-center gap-3">
            <ProviderLogo provider={draft.provider} />
            <select
              value={draft.provider}
              onChange={(e) => patch({ provider: e.target.value as IntegrationProvider })}
              className={INPUT_CLASS}
            >
              {INTEGRATION_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.name')}
          </label>
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t('integrations.namePlaceholder')}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.url')}
            {!urlRequired && <span className="ml-1 text-fgmuted">({t('integrations.optional')})</span>}
          </label>
          <input
            value={draft.baseUrl}
            onChange={(e) => patch({ baseUrl: e.target.value })}
            placeholder={
              draft.provider === 'github'
                ? 'https://api.github.com'
                : draft.provider === 'gitlab'
                  ? 'https://gitlab.com'
                  : 'http://localhost:3000'
            }
            className={INPUT_CLASS}
            spellCheck={false}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.token')}
          </label>
          <input
            type="password"
            value={draft.token}
            onChange={(e) => patch({ token: e.target.value })}
            placeholder={t('integrations.tokenPlaceholder')}
            className={INPUT_CLASS}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runTest}
            disabled={!draft.token.trim() || test.phase === 'testing'}
            className="rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-hover disabled:cursor-default disabled:opacity-50"
          >
            {test.phase === 'testing' ? t('integrations.testing') : t('integrations.test')}
          </button>
          {test.phase === 'done' && test.result.ok && (
            <span className="text-sm text-emerald-400">
              {test.result.username
                ? t('integrations.testOk', { user: test.result.username })
                : t('integrations.testOkNoUser')}
            </span>
          )}
          {test.phase === 'done' && !test.result.ok && (
            <span className="text-sm text-red-400">
              {describeIntegrationError(test.result.error ?? 'network', t)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg"
        >
          {t('integrations.cancel')}
        </button>
        <button
          onClick={() => onSave({ ...draft, name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), token: draft.token.trim() })}
          disabled={!canSave}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-default disabled:opacity-50"
        >
          {t('integrations.save')}
        </button>
      </div>
    </div>
  )
}

export function IntegrationsSection({ onChanged }: { onChanged?: () => void }): JSX.Element {
  const { t } = useI18n()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [editing, setEditing] = useState<Integration | null>(null)

  useEffect(() => {
    window.api.listIntegrations().then((s) => setIntegrations(s.integrations))
  }, [])

  const apply = (next: Integration[]): void => {
    setIntegrations(next)
    onChanged?.()
  }

  const save = async (integration: Integration): Promise<void> => {
    const state = await window.api.saveIntegration(integration)
    apply(state.integrations)
    setEditing(null)
  }

  const remove = async (id: string): Promise<void> => {
    const state = await window.api.deleteIntegration(id)
    apply(state.integrations)
    if (editing?.id === id) setEditing(null)
  }

  return (
    <>
      <h2 className="mb-1.5 text-lg font-semibold text-fg">{t('settings.integrations')}</h2>
      <p className="mb-6 max-w-xl text-xs text-fgdim">{t('integrations.desc')}</p>

      <div className="max-w-xl">
        {integrations.length === 0 && !editing && (
          <p className="mb-4 rounded-lg border border-dashed border-edge px-4 py-6 text-center text-sm text-fgmuted">
            {t('integrations.empty')}
          </p>
        )}

        <ul className="space-y-2">
          {integrations.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-xl border border-edge bg-bar px-4 py-3"
            >
              <ProviderLogo provider={it.provider} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg">{it.name}</span>
                  <span className="shrink-0 rounded-full bg-accentBg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    {providerLabel(it.provider)}
                  </span>
                </div>
                <div className="truncate text-xs text-fgmuted">
                  {it.baseUrl || 'https://api.github.com'}
                </div>
              </div>
              <button
                onClick={() => setEditing(it)}
                className="rounded-md px-2 py-1 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg"
              >
                {t('integrations.edit')}
              </button>
              <button
                onClick={() => remove(it.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-400/80 transition hover:bg-hover hover:text-red-300"
              >
                {t('integrations.remove')}
              </button>
            </li>
          ))}
        </ul>

        {editing ? (
          <div className="mt-3">
            <IntegrationForm
              key={editing.id || 'new'}
              initial={editing}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing(emptyDraft())}
            className="mt-3 flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm font-medium text-fg transition hover:bg-hover"
          >
            <span className="text-base leading-none text-accent">+</span>
            {t('integrations.add')}
          </button>
        )}
      </div>
    </>
  )
}
