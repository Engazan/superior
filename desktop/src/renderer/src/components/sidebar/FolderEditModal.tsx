import { useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { Button, ColorSwatchPicker, Field, FolderIcon, Input, Modal } from '../ui'
import type { Folder, FolderUpdate } from '../../types'

interface Props {
  folder: Folder
  onCancel: () => void
  onSave: (patch: FolderUpdate) => void
}

/**
 * Edit a folder's visuals: a custom display name, uploaded icon and row tint.
 * The folder's path is immutable and shown read-only for reference.
 */
export function FolderEditModal({ folder, onCancel, onSave }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(folder.displayName ?? '')
  const nameRef = useRef<HTMLInputElement>(null)
  // undefined = leave icon untouched; string = new icon; null = clear icon.
  const [icon, setIcon] = useState<string | null | undefined>(undefined)
  const [color, setColor] = useState<string | null>(folder.color ?? null)

  // The icon currently shown in the preview: the pending edit, else the stored one.
  const previewIcon = icon === undefined ? folder.icon : icon

  const pickIcon = async (): Promise<void> => {
    const picked = await window.api.pickPresetImage()
    if (picked) setIcon(picked.dataUrl)
  }

  const submit = (): void => {
    onSave({
      displayName: name.trim() || null,
      color: color || null,
      ...(icon === undefined ? {} : { icon })
    })
    onCancel()
  }

  return (
    <Modal
      size="lg"
      title={t('folder.editModalTitle')}
      description={t('folder.editModalDescription')}
      onClose={onCancel}
      initialFocusRef={nameRef}
      closeLabel={t('common.cancel')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>{t('folder.saveAction')}</Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Field label={t('folder.icon')}>
          <div role="group" aria-label={t('folder.icon')} className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-hover text-fgdim ring-1 ring-inset ring-edge">
              {previewIcon ? (
                <img src={previewIcon} alt="" className="h-full w-full object-cover" />
              ) : (
                <FolderIcon />
              )}
            </span>
            <Button type="button" variant="secondary" onClick={() => void pickIcon()}>
              {t('folder.uploadIcon')}
            </Button>
            {previewIcon && (
              <Button type="button" variant="ghost" onClick={() => setIcon(null)}>
                {t('folder.removeIcon')}
              </Button>
            )}
          </div>
        </Field>

        <Field
          label={t('folder.displayName')}
          htmlFor="folder-name"
          hint={t('folder.displayNameHint')}
        >
          <Input
            id="folder-name"
            ref={nameRef}
            value={name}
            placeholder={folder.name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field label={t('folder.color')}>
          <div role="group" aria-label={t('folder.color')}>
            <ColorSwatchPicker color={color} onChange={setColor} />
          </div>
        </Field>

        <Field label={t('folder.path')}>
          <div className="flex items-center gap-2 rounded-md border border-edge bg-bar px-3 py-2 text-fgdim">
            <FolderIcon />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={folder.path}>
              {folder.path}
            </span>
          </div>
        </Field>

        {/* Hidden submit so Enter in any field submits the form. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
