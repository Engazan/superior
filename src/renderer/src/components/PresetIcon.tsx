import type { PresetIconType } from '../types'

interface Props {
  iconType?: PresetIconType
  icon?: string
  className?: string
}

/** Renders a preset's icon — an emoji/character or a custom image. */
export function PresetIcon({ iconType, icon, className }: Props): JSX.Element {
  if (iconType === 'image' && icon) {
    return <img src={icon} alt="" className={`object-contain ${className ?? 'h-4 w-4'}`} />
  }
  return (
    <span className={`inline-flex items-center justify-center leading-none ${className ?? ''}`}>
      {icon || '▰'}
    </span>
  )
}
