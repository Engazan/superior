import { useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { BUILTIN_ICONS } from '@shared/icons'
import { useI18n } from '../i18n'
import { Button, ColorSwatchPicker, Input, Modal } from './ui'
import type { PresetIconType, TerminalPreset } from '../types'

interface Props {
  /** The preset being edited, or null when adding a new one. */
  preset: TerminalPreset | null
  onSave: (preset: TerminalPreset) => void
  onCancel: () => void
  onPickImage: () => Promise<{ dataUrl: string } | null>
}

export function PresetForm({ preset, onSave, onCancel, onPickImage }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(preset?.name ?? '')
  const [nickname, setNickname] = useState(preset?.nickname ?? '')
  const [description, setDescription] = useState(preset?.description ?? '')
  const [command, setCommand] = useState(preset?.command ?? '')
  const [iconType, setIconType] = useState<PresetIconType>(preset?.iconType ?? 'image')
  const [icon, setIcon] = useState(preset?.icon ?? BUILTIN_ICONS[0].dataUrl)
  const [color, setColor] = useState<string | null>(preset?.color ?? null)

  // Command may be left empty: an empty command launches a plain interactive shell.
  const canSave = name.trim().length > 0

  const chooseImage = async (): Promise<void> => {
    const res = await onPickImage()
    if (res) {
      setIconType('image')
      setIcon(res.dataUrl)
    }
  }

  const submit = (): void => {
    if (!canSave) return
    onSave({
      id: preset?.id ?? crypto.randomUUID(),
      name: name.trim(),
      nickname: nickname.trim() || undefined,
      description: description.trim(),
      command: command.trim(),
      iconType,
      icon,
      color: color ?? undefined,
      active: preset?.active ?? false
    })
  }

  return (
    <Modal
      title={preset ? t('form.editTitle') : t('form.addTitle')}
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
          {/* Icon */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-fgdim">{t('form.icon')}</label>
              <button
                type="button"
                className="rounded-md border border-edge px-2 py-0.5 text-xs text-fgdim hover:bg-hover hover:text-fg"
                onClick={chooseImage}
              >
                {t('form.customImage')}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {BUILTIN_ICONS.map((bi) => {
                const selected = iconType === 'image' && icon === bi.dataUrl
                return (
                  <button
                    key={bi.id}
                    type="button"
                    onClick={() => {
                      setIconType('image')
                      setIcon(bi.dataUrl)
                    }}
                    title={bi.label}
                    className={`flex flex-col items-center gap-1 rounded-md border p-1.5 ${
                      selected ? 'border-accent bg-bar' : 'border-edge hover:bg-hover'
                    }`}
                  >
                    <img src={bi.dataUrl} alt="" className="h-6 w-6" />
                    <span className="w-full truncate text-center text-[10px] text-fgdim">
                      {bi.label}
                    </span>
                  </button>
                )
              })}
            </div>
            {iconType === 'image' && !BUILTIN_ICONS.some((bi) => bi.dataUrl === icon) && (
              <div className="mt-2 flex items-center gap-2 text-xs text-fgdim">
                <PresetIcon iconType={iconType} icon={icon} className="h-6 w-6" />
                <span>{t('form.customImageSelected')}</span>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">{t('form.name')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude" />
          </div>

          {/* Nickname — optional; pre-fills the terminal's nickname on launch. */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">
              {t('form.nickname')}
            </label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('form.nicknamePlaceholder')}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">
              {t('form.description')}
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anthropic Claude CLI"
            />
          </div>

          {/* Command */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">
              {t('form.command')}
            </label>
            <Input
              className="font-mono"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="claude"
            />
          </div>

          {/* Color — tints the top bar while a session from this preset is active. */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">{t('form.color')}</label>
            <ColorSwatchPicker color={color} onChange={setColor} />
          </div>
        </div>
    </Modal>
  )
}
