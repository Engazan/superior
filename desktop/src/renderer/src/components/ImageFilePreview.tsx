import { useState } from 'react'
import { useI18n } from '../i18n'

interface Props {
  dataUrl: string
  alt: string
}

/** Native image preview. The data URL is read-only; the file is never written. */
export function ImageFilePreview({ dataUrl, alt }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  if (failed) {
    // A bad extension guess produces a broken data URL — show a message
    // instead of the browser's broken-image glyph.
    return (
      <div className="grid h-full place-items-center px-6 text-center text-xs text-fgmuted">
        {t('preview.binary')}
      </div>
    )
  }
  return (
    <div className="grid h-full place-items-center overflow-auto p-4">
      <img
        src={dataUrl}
        alt={alt}
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  )
}
