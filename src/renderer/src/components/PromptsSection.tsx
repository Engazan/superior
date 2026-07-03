import { useState } from 'react'
import { useI18n } from '../i18n'
import { usePrompts } from '../hooks/usePrompts'
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  PencilIcon,
  SectionHeader,
  TrashIcon,
  useConfirm,
  useToast
} from './ui'
import type { Prompt } from '../types'

/** Settings section managing the saved prompt/snippet library. */
export function PromptsSection(): JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const { prompts, savePrompt, deletePrompt } = usePrompts()
  const [editing, setEditing] = useState<Prompt | 'new' | null>(null)

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
    <div className="max-w-2xl">
      <SectionHeader
        title={t('settings.prompts')}
        description={t('prompts.desc')}
        actions={<Button onClick={() => setEditing('new')}>{t('prompts.add')}</Button>}
      />

      {prompts.length === 0 ? (
        <EmptyState title={t('prompts.empty')} />
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-lg border border-edge">
          {prompts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
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
}): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(prompt?.name ?? '')
  const [text, setText] = useState(prompt?.text ?? '')
  const canSave = name.trim().length > 0 && text.trim().length > 0

  const submit = (): void => {
    if (!canSave) return
    void onSave({
      id: prompt?.id ?? crypto.randomUUID(),
      name: name.trim(),
      text,
      createdAt: prompt?.createdAt ?? Date.now()
    })
  }

  return (
    <Modal
      title={prompt ? t('prompts.editTitle') : t('prompts.addTitle')}
      onClose={onCancel}
      closeLabel={t('common.cancel')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!canSave} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-fgdim">{t('prompts.name')}</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('prompts.namePlaceholder')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fgdim">{t('prompts.text')}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={t('prompts.textPlaceholder')}
            className="w-full resize-y rounded-md border border-edge bg-bar px-2.5 py-2 text-sm text-fg placeholder:text-fgmuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </div>
      </div>
    </Modal>
  )
}
