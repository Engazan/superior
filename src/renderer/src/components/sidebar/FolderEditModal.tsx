import { useState } from 'react'
import { useI18n } from '../../i18n'
import { Button, COLOR_SWATCHES, FolderIcon, Input, Modal } from '../ui'
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
export function FolderEditModal({ folder, onCancel, onSave }: Props): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(folder.displayName ?? '')
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
      <div className="space-y-5">
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-fgdim">{t('folder.icon')}</span>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-hover text-fgdim ring-1 ring-inset ring-edge">
              {previewIcon ? (
                <img src={previewIcon} alt="" className="h-full w-full object-cover" />
              ) : (
                <FolderIcon />
              )}
            </span>
            <Button variant="secondary" onClick={() => void pickIcon()}>
              {t('folder.uploadIcon')}
            </Button>
            {previewIcon && (
              <Button variant="ghost" onClick={() => setIcon(null)}>
                {t('folder.removeIcon')}
              </Button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="folder-name" className="mb-1.5 block text-xs font-semibold text-fgdim">
            {t('folder.displayName')}
          </label>
          <Input
            id="folder-name"
            autoFocus
            value={name}
            placeholder={folder.name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-fgmuted">{t('folder.displayNameHint')}</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-fgdim">{t('folder.color')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`rounded-md border px-2 py-1 text-xs ${
                color === null
                  ? 'border-accent bg-bar text-fg'
                  : 'border-edge text-fgdim hover:bg-hover'
              }`}
            >
              {t('form.colorNone')}
            </button>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                className={`h-7 w-7 rounded-md border ${
                  color?.toLowerCase() === c.toLowerCase()
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-edge'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              title={t('form.colorCustom')}
              className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-edge"
              style={{ backgroundColor: color ?? 'transparent' }}
            >
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-fgdim">
                +
              </span>
              <input
                type="color"
                value={color ?? '#888888'}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-bar p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fgdim">
              <FolderIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fgmuted">
                {t('folder.path')}
              </p>
              <p className="mt-0.5 truncate text-xs text-fg" title={folder.path}>
                {folder.path}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
