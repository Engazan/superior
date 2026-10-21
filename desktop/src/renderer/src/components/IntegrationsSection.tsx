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
  Field,
  FieldTag,
  IconButton,
  Input,
  Notice,
  PencilIcon,
  SectionHeader,
  PlusIcon,
  Select,
  StatusPill,
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
  onSave: (integration: Integration) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Integration>(initial)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const patch = (p: Partial<Integration>): void => {
    setDraft((d) => ({ ...d, ...p }))
    setTest({ phase: 'idle' })
    setSaveError(null)
  }

  const urlRequired = draft.provider !== 'github'
  const canSave =
    !busy &&
    !!draft.name.trim() &&
    !!(draft.token.trim() || draft.hasToken) &&
    (!urlRequired || !!draft.baseUrl.trim())

  const runTest = async (): Promise<void> => {
    setTest({ phase: 'testing' })
    const result = await window.api.testIntegration({
      provider: draft.provider,
      baseUrl: draft.baseUrl,
      token: draft.token
    })
    setTest({ phase: 'done', result })
  }

  const submit = async (): Promise<void> => {
    if (!canSave) return
    setBusy(true)
    setSaveError(null)
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        baseUrl: draft.baseUrl.trim(),
        token: draft.token.trim()
      })
    } catch (err) {
      // On success the parent unmounts the form; a failure keeps the draft.
      setSaveError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form
      className="settings-island p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="space-y-5">
        <Field label={t('integrations.provider')} htmlFor="integration-provider">
          <div className="flex items-center gap-3">
            <ProviderLogo provider={draft.provider} />
            <Select
              id="integration-provider"
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
        </Field>

        <Field label={t('integrations.name')} htmlFor="integration-name">
          <Input
            id="integration-name"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t('integrations.namePlaceholder')}
            autoComplete="off"
          />
        </Field>

        <Field
          label={t('integrations.url')}
          htmlFor="integration-url"
          aside={!urlRequired ? <FieldTag>{t('integrations.optional')}</FieldTag> : undefined}
        >
          <Input
            id="integration-url"
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
            autoComplete="off"
          />
        </Field>

        <Field label={t('integrations.token')} htmlFor="integration-token">
          <Input
            id="integration-token"
            type="password"
            value={draft.token}
            onChange={(e) => patch({ token: e.target.value })}
            placeholder={t('integrations.tokenPlaceholder')}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            loading={test.phase === 'testing'}
            disabled={!draft.token.trim()}
            onClick={() => void runTest()}
          >
            {test.phase === 'testing' ? t('integrations.testing') : t('integrations.test')}
          </Button>
          {test.phase === 'done' && (
            <Notice tone={test.result.ok ? 'success' : 'danger'}>
              {test.result.ok
                ? test.result.username
                  ? t('integrations.testOk', { user: test.result.username })
                  : t('integrations.testOkNoUser')
                : describeIntegrationError(test.result.error ?? 'network', t)}
            </Notice>
          )}
        </div>

        {saveError && <Notice>{saveError}</Notice>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('integrations.cancel')}
        </Button>
        <Button type="submit" loading={busy} disabled={!canSave}>
          {t('integrations.save')}
        </Button>
      </div>
    </form>
  )
}

export function IntegrationsSection({ onChanged }: { onChanged?: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [editing, setEditing] = useState<Integration | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void window.api
      .listIntegrations()
      .then((s) => setIntegrations(s.integrations))
      .finally(() => setLoaded(true))
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
    <div className="settings-section">
      <SectionHeader
        title={t('settings.integrations')}
        description={t('integrations.desc')}
        actions={
          !editing && (
            <Button onClick={() => setEditing(emptyDraft())}>
              <PlusIcon />
              {t('integrations.add')}
            </Button>
          )
        }
      />

      {!loaded ? (
        <p role="status" className="text-sm text-fgmuted">
          {t('common.loading')}
        </p>
      ) : (
        integrations.length === 0 && !editing && <EmptyState title={t('integrations.empty')} />
      )}

      {integrations.length > 0 && (
        <ul className="settings-island divide-y divide-edge">
          {integrations.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover">
              <ProviderLogo provider={it.provider} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg">{it.name}</span>
                  <StatusPill tone="accent">{providerLabel(it.provider)}</StatusPill>
                </div>
                <div className="truncate text-xs text-fgmuted">
                  {it.baseUrl || 'https://api.github.com'}
                </div>
              </div>
              <IconButton
                size="sm"
                label={`${t('integrations.edit')} ${it.name}`}
                title={t('integrations.edit')}
                onClick={() => setEditing(it)}
              >
                <PencilIcon size={13} />
              </IconButton>
              <IconButton
                size="sm"
                variant="danger-ghost"
                label={`${t('integrations.remove')} ${it.name}`}
                title={t('integrations.remove')}
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
