import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import {
  INTEGRATION_PROVIDERS,
  describeIntegrationError,
  providerLabel,
  providerLogo
} from '../integrations'
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  SectionHeader,
  Select,
  TrashIcon,
  useConfirm,
  useToast
} from './ui'
import type { Integration, IntegrationProvider, IntegrationTestResult } from '../types'

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
}): React.JSX.Element {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-edge bg-panel shadow-xs ${className}`}
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
}): React.JSX.Element {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Integration>(initial)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  const patch = (p: Partial<Integration>): void => {
    setDraft((d) => ({ ...d, ...p }))
    setTest({ phase: 'idle' })
  }

  const urlRequired = draft.provider !== 'github'
  const canSave =
    draft.name.trim() &&
    (draft.token.trim() || draft.hasToken) &&
    (!urlRequired || draft.baseUrl.trim())

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
    <div className="rounded-lg border border-edge bg-bar p-4">
      <div className="grid gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.provider')}
          </label>
          <div className="flex items-center gap-3">
            <ProviderLogo provider={draft.provider} />
            <Select
              value={draft.provider}
              onChange={(e) => patch({ provider: e.target.value as IntegrationProvider })}
            >
              {INTEGRATION_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.name')}
          </label>
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t('integrations.namePlaceholder')}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.url')}
            {!urlRequired && <span className="ml-1 text-fgmuted">({t('integrations.optional')})</span>}
          </label>
          <Input
            value={draft.baseUrl}
            onChange={(e) => patch({ baseUrl: e.target.value })}
            placeholder={
              draft.provider === 'github'
                ? 'https://api.github.com'
                : draft.provider === 'gitlab'
                  ? 'https://gitlab.com'
                  : 'http://localhost:3000'
            }
            spellCheck={false}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            {t('integrations.token')}
          </label>
          <Input
            type="password"
            value={draft.token}
            onChange={(e) => patch({ token: e.target.value })}
            placeholder={t('integrations.tokenPlaceholder')}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={test.phase === 'testing'}
            disabled={!draft.token.trim()}
            onClick={runTest}
          >
            {test.phase === 'testing' ? t('integrations.testing') : t('integrations.test')}
          </Button>
          {test.phase === 'done' && test.result.ok && (
            <span className="text-sm text-status">
              {test.result.username
                ? t('integrations.testOk', { user: test.result.username })
                : t('integrations.testOkNoUser')}
            </span>
          )}
          {test.phase === 'done' && !test.result.ok && (
            <span className="text-sm text-danger">
              {describeIntegrationError(test.result.error ?? 'network', t)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('integrations.cancel')}
        </Button>
        <Button
          disabled={!canSave}
          onClick={() =>
            onSave({
              ...draft,
              name: draft.name.trim(),
              baseUrl: draft.baseUrl.trim(),
              token: draft.token.trim()
            })
          }
        >
          {t('integrations.save')}
        </Button>
      </div>
    </div>
  )
}

export function IntegrationsSection({ onChanged }: { onChanged?: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
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
    toast.success(t('toast.integrationSaved', { name: integration.name }))
  }

  const remove = async (it: Integration): Promise<void> => {
    // One click used to delete the forge + token permanently — confirm first.
    const ok = await confirm({
      title: t('confirm.integrationRemoveTitle'),
      message: t('confirm.integrationRemoveMessage', { name: it.name }),
      confirmLabel: t('integrations.remove'),
      tone: 'danger'
    })
    if (!ok) return
    const state = await window.api.deleteIntegration(it.id)
    apply(state.integrations)
    if (editing?.id === it.id) setEditing(null)
    toast.success(t('toast.integrationRemoved', { name: it.name }))
  }

  return (
    <div className="max-w-2xl">
      <SectionHeader
        title={t('settings.integrations')}
        description={t('integrations.desc')}
        actions={
          !editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(emptyDraft())}>
              <span className="text-base leading-none text-accent">+</span>
              {t('integrations.add')}
            </Button>
          )
        }
      />

      {integrations.length === 0 && !editing && <EmptyState title={t('integrations.empty')} />}

      {integrations.length > 0 && (
        <ul className="settings-island divide-y divide-edge">
          {integrations.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
              <ProviderLogo provider={it.provider} className="h-9 w-9" />
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
              <Button variant="ghost" size="sm" onClick={() => setEditing(it)}>
                {t('integrations.edit')}
              </Button>
              <IconButton
                size="sm"
                variant="danger-ghost"
                label={t('integrations.remove')}
                onClick={() => void remove(it)}
              >
                <TrashIcon size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div
          className="mt-3"
          // The form renders below the list — clicking Edit on the first row
          // can otherwise leave it off-screen with no hint it opened.
          ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
        >
          <IntegrationForm
            key={editing.id || 'new'}
            initial={editing}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  )
}
