import { useI18n } from '../../i18n'
import { COLOR_SWATCHES } from './swatches'

interface Props {
  /** Current color (null = none). */
  color: string | null
  onChange: (color: string | null) => void
  /** Render the leading "None" pill (default true). */
  none?: boolean
  /** Called after a fixed swatch was picked (not the custom input) — popover
      callers close themselves here while custom picking stays interactive. */
  onSwatchPick?: () => void
}

/** Swatch row + free-pick `<input type=color>`. Consolidates the color field
 *  previously copy-pasted across PresetForm, FolderEditModal and ProfileManager. */
export function ColorSwatchPicker({
  color,
  onChange,
  none = true,
  onSwatchPick
}: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {none && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-md border px-2 py-1 text-xs ${
            color === null
              ? 'border-accent bg-bar text-fg'
              : 'border-edge text-fgdim hover:bg-hover'
          }`}
        >
          {t('form.colorNone')}
        </button>
      )}
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => {
            onChange(c)
            onSwatchPick?.()
          }}
          title={c}
          aria-label={c}
          className={`h-7 w-7 rounded-md border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
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
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}
