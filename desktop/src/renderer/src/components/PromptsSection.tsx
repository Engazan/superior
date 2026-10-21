import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { usePrompts } from '../hooks/usePrompts'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Notice,
  PencilIcon,
  SectionHeader,
  PlusIcon,
  Textarea,
  TrashIcon,
  useConfirm,
  useToast
} from './ui'
import type { Prompt } from '../types'

/** Settings section managing the saved prompt/snippet library. */
export function PromptsSection(): React.JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const { prompts, savePrompt, deletePrompt } = usePrompts()
  const [editing, setEditing] = useState<Prompt | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const filteredPrompts = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return prompts
    return prompts.filter((prompt) => `${prompt.name} ${prompt.text}`.toLowerCase().includes(value))
  }, [prompts, query])

  const remove = async (p: Prompt): Promise<void> => {
    const ok = await confirm({
      title: t('prompts.deleteTitle'),
      message: t('prompts.deleteConfirm', { name: p.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    })
    if (ok) {
      await deletePrompt(p.id)
      toast.success(t('prompts.deleted', { name: p.name }))
    }
  }

  return (
    <div className="settings-section">
      <SectionHeader
        title={t('settings.prompts')}
        description={t('prompts.desc')}
        actions={<Button onClick={() => setEditing('new')}><PlusIcon />{t('prompts.add')}</Button>}
      />

      {prompts.length > 0 && (
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder={t('prompts.pickerPlaceholder')}
          aria-label={t('prompts.pickerPlaceholder')}
          className="mb-3 max-w-md"
        />
      )}

      {prompts.length === 0 ? (
        <EmptyState title={t('prompts.empty')} />
      ) : filteredPrompts.length === 0 ? (
        <EmptyState title={t('palette.noResults')} />
      ) : (
        <ul className="settings-island divide-y divide-edge">
          {filteredPrompts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-fg">{p.name}</div>
                <div className="truncate text-xs text-fgmuted">{p.text}</div>
              </div>
              <IconButton
                size="sm"
                label={`${t('common.edit')} ${p.name}`}
                title={t('common.edit')}
                onClick={() => setEditing(p)}
              >
                <PencilIcon size={13} />
              </IconButton>
              <IconButton
                size="sm"
                variant="danger-ghost"
                label={`${t('common.delete')} ${p.name}`}
                title={t('common.delete')}
                onClick={() => void remove(p)}
              >
                <TrashIcon size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <PromptForm
          prompt={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (prompt) => {
            await savePrompt(prompt)
            setEditing(null)
            toast.success(t('prompts.saved', { name: prompt.name }))
          }}
        />
      )}
    </div>
  )
}

function PromptForm({
  prompt,
  onSave,
  onCancel
}: {
  prompt: Prompt | null
  onSave: (prompt: Prompt) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(prompt?.name ?? '')
  const [text, setText] = useState(prompt?.text ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const canSave = !busy && name.trim().length > 0 && text.trim().length > 0

  const submit = async (): Promise<void> => {
    if (!canSave) return
    setBusy(true)
    setSaveError(null)
    try {
      await onSave({
        id: prompt?.id ?? crypto.randomUUID(),
        name: name.trim(),
        text,
        createdAt: prompt?.createdAt ?? Date.now()
      })
    } catch (err) {
      // The parent closes the modal on success; a failure keeps the draft.
      setSaveError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={prompt ? t('prompts.editTitle') : t('prompts.addTitle')}
      onClose={() => !busy && onCancel()}
      closeLabel={t('common.cancel')}
      dismissable={!busy}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!canSave} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label={t('prompts.name')} htmlFor="prompt-name">
          <Input
            id="prompt-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('prompts.namePlaceholder')}
            autoComplete="off"
          />
        </Field>
        <Field label={t('prompts.text')} htmlFor="prompt-text">
          <Textarea
            id="prompt-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={t('prompts.textPlaceholder')}
          />
        </Field>

        {saveError && <Notice>{saveError}</Notice>}

        {/* Hidden submit so Enter in the name field submits the form. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
