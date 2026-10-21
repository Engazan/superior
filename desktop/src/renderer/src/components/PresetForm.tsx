import { useId, useRef, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { BUILTIN_ICONS } from '@shared/icons'
import { useI18n } from '../i18n'
import { Button, ColorSwatchPicker, Field, Input, Modal } from './ui'
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
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(preset?.name ?? '')
  const [nickname, setNickname] = useState(preset?.nickname ?? '')
  const [description, setDescription] = useState(preset?.description ?? '')
  const [command, setCommand] = useState(preset?.command ?? '')
  const [iconType, setIconType] = useState<PresetIconType>(preset?.iconType ?? 'image')
  const [icon, setIcon] = useState(preset?.icon ?? BUILTIN_ICONS[0].dataUrl)
  const [color, setColor] = useState<string | null>(preset?.color ?? null)

  // Command may be left empty: an empty command launches a plain interactive shell.
  const canSave = name.trim().length > 0
  const customImage = iconType === 'image' && !BUILTIN_ICONS.some((bi) => bi.dataUrl === icon)

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
      initialFocusRef={nameRef}
      closeLabel={t('common.cancel')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={!canSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Field
          label={t('form.icon')}
          aside={
            <Button type="button" size="sm" variant="secondary" onClick={() => void chooseImage()}>
              {t('form.customImage')}
            </Button>
          }
          hint={
            customImage ? (
              <span className="flex items-center gap-2">
                <PresetIcon iconType={iconType} icon={icon} className="h-5 w-5" />
                {t('form.customImageSelected')}
              </span>
            ) : undefined
          }
        >
          <div role="group" aria-label={t('form.icon')} className="grid grid-cols-5 gap-1.5">
            {BUILTIN_ICONS.map((bi) => {
              const selected = iconType === 'image' && icon === bi.dataUrl
              return (
                <button
                  key={bi.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setIconType('image')
                    setIcon(bi.dataUrl)
                  }}
                  title={bi.label}
                  className={`flex flex-col items-center gap-1 rounded-md border p-1.5 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    selected ? 'border-accent bg-accentBg/70' : 'border-edge hover:bg-hover'
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
        </Field>

        <Field label={t('form.name')} htmlFor="preset-name">
          <Input
            id="preset-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude"
            autoComplete="off"
          />
        </Field>

        {/* Nickname — optional; pre-fills the terminal's nickname on launch. */}
        <Field label={t('form.nickname')} htmlFor="preset-nickname">
          <Input
            id="preset-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t('form.nicknamePlaceholder')}
            autoComplete="off"
          />
        </Field>

        <Field label={t('form.description')} htmlFor="preset-description">
          <Input
            id="preset-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anthropic Claude CLI"
            autoComplete="off"
          />
        </Field>

        <Field label={t('form.command')} htmlFor="preset-command">
          <Input
            id="preset-command"
            className="font-mono"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="claude"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        {/* Color — tints the top bar while a session from this preset is active. */}
        <Field label={t('form.color')}>
          <div role="group" aria-label={t('form.color')}>
            <ColorSwatchPicker color={color} onChange={setColor} />
          </div>
        </Field>
      </form>
    </Modal>
  )
}
