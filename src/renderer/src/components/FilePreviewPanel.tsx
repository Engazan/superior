import { useEffect, useMemo, useState } from 'react'
import { json as jsonLang } from '@codemirror/lang-json'
import { CodeFilePreview } from './CodeFilePreview'
import { MarkdownFilePreview } from './MarkdownFilePreview'
import { ImageFilePreview } from './ImageFilePreview'
import { UnsupportedFilePreview } from './UnsupportedFilePreview'
import { useI18n } from '../i18n'
import {
  IMAGE_MAX_BYTES,
  TEXT_MAX_BYTES,
  formatBytes,
  getCodeMirrorLanguage,
  getFilePreviewType,
  guessMimeType
} from '../filePreview'
import type { FileReadResult, FsEntry } from '../types'

interface Props {
  file: FsEntry
  onClose: () => void
}

/** Pretty-print JSON when possible; fall back to the raw text on parse errors. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: JSX.Element
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded text-fgmuted transition hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  )
}

export function FilePreviewPanel({ file, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const type = useMemo(() => getFilePreviewType(file), [file])
  const [data, setData] = useState<FileReadResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const openRaw = (): void => void window.api.openPath(file.path)
  const copyPath = (): void => {
    void navigator.clipboard.writeText(file.path)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setData(null)
    const isImage = type === 'image'
    const needsContent = type !== 'pdf' && type !== 'unsupported'
    window.api
      .readFile(file.path, {
        maxBytes: isImage ? IMAGE_MAX_BYTES : TEXT_MAX_BYTES,
        asBase64: isImage,
        read: needsContent
      })
      .then((res) => {
        if (!active) return
        setData(res)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [file.path, type])

  const renderBody = (): JSX.Element => {
    if (loading || !data) {
      return <div className="grid h-full place-items-center text-xs text-fgmuted">{t('preview.loading')}</div>
    }
    if (data.error) {
      return <div className="grid h-full place-items-center px-6 text-center text-xs text-rose-400">{data.error}</div>
    }

    // A file with a text-ish extension that's actually binary → fall back.
    const effectiveType = (type === 'code' || type === 'json' || type === 'markdown') && data.isBinary ? 'unsupported' : type

    switch (effectiveType) {
      case 'image':
        if (data.truncated) {
          return <UnsupportedFilePreview reason={t('preview.tooLargeImage')} onOpenRaw={openRaw} />
        }
        return (
          <ImageFilePreview
            dataUrl={`data:${guessMimeType(file)};base64,${data.content}`}
            alt={file.name}
          />
        )
      case 'markdown':
        return (
          <div className="flex h-full min-h-0 flex-col">
            {data.truncated && <TruncatedWarning onOpenRaw={openRaw} />}
            <div className="min-h-0 flex-1">
              <MarkdownFilePreview content={data.content} />
            </div>
          </div>
        )
      case 'json':
        return (
          <div className="flex h-full min-h-0 flex-col">
            {data.truncated && <TruncatedWarning onOpenRaw={openRaw} />}
            <div className="min-h-0 flex-1">
              <CodeFilePreview content={prettyJson(data.content)} language={jsonLang()} />
            </div>
          </div>
        )
      case 'code':
        return (
          <div className="flex h-full min-h-0 flex-col">
            {data.truncated && <TruncatedWarning onOpenRaw={openRaw} />}
            <div className="min-h-0 flex-1">
              <CodeFilePreview content={data.content} language={getCodeMirrorLanguage(file)} />
            </div>
          </div>
        )
      case 'pdf':
        return <UnsupportedFilePreview reason={t('preview.pdfDisabled')} onOpenRaw={openRaw} />
      default:
        return <UnsupportedFilePreview reason={t('preview.binary')} onOpenRaw={openRaw} />
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-bar px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg" title={file.name}>
            {file.name}
          </div>
          <div className="truncate text-[11px] text-fgmuted" title={file.path}>
            {file.path}
            {data && !loading && !data.error && ` · ${formatBytes(data.size)}`}
          </div>
        </div>

        <IconButton label={copied ? t('preview.copied') : t('preview.copyPath')} onClick={copyPath}>
          {copied ? (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M3.5 10.5h-.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v.5" />
            </svg>
          )}
        </IconButton>

        <IconButton label={t('preview.openRaw')} onClick={openRaw}>
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 2.5h4.5V7" />
            <path d="M13.5 2.5 7 9" />
            <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
          </svg>
        </IconButton>

        <IconButton label={t('window.close')} onClick={onClose}>
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </IconButton>
      </div>

      <div className="min-h-0 flex-1">{renderBody()}</div>
    </div>
  )
}

function TruncatedWarning({ onOpenRaw }: { onOpenRaw: () => void }): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-500">
      <span>{t('preview.truncated')}</span>
      <button onClick={onOpenRaw} className="shrink-0 font-medium underline-offset-2 hover:underline">
        {t('preview.openRaw')}
      </button>
    </div>
  )
}
