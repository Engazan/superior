import { useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { BUILTIN_ICONS } from '@shared/icons'
import { useI18n } from '../i18n'
import type { PresetIconType, TerminalPreset } from '../types'

interface Props {
  /** The preset being edited, or null when adding a new one. */
  preset: TerminalPreset | null
  onSave: (preset: TerminalPreset) => void
  onCancel: () => void
  onPickImage: () => Promise<{ dataUrl: string } | null>
}

const inputCls =
  'w-full rounded-md border border-edge bg-bar px-3 py-1.5 text-sm text-fg outline-none focus:border-sky-500'

/** Quick-pick tints for the top bar; users can also choose any custom color. */
const COLOR_SWATCHES = ['#D97757', '#10A37F', '#3B82F6', '#A855F7', '#EAB308', '#EF4444']

export function PresetForm({ preset, onSave, onCancel, onPickImage }: Props): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(preset?.name ?? '')
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
      description: description.trim(),
      command: command.trim(),
      iconType,
      icon,
      color: color ?? undefined,
      active: preset?.active ?? false
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-edge bg-panel p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-fg">
          {preset ? t('form.editTitle') : t('form.addTitle')}
        </h3>

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
                      selected ? 'border-sky-500 bg-bar' : 'border-edge hover:bg-hover'
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
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">
              {t('form.description')}
            </label>
            <input
              className={inputCls}
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
            <input
              className={`${inputCls} font-mono`}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="claude"
            />
          </div>

          {/* Color — tints the top bar while a session from this preset is active. */}
          <div>
            <label className="mb-1 block text-xs font-medium text-fgdim">{t('form.color')}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  color === null
                    ? 'border-sky-500 bg-bar text-fg'
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
                      ? 'border-sky-500 ring-1 ring-sky-500'
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
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-fgdim hover:text-fg"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={!canSave}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={submit}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
