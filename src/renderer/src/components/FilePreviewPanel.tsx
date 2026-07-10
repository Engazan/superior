import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { json as jsonLang } from '@codemirror/lang-json'
import { CodeFilePreview } from './CodeFilePreview'
import { MarkdownFilePreview } from './MarkdownFilePreview'
import { ImageFilePreview } from './ImageFilePreview'
import { UnsupportedFilePreview } from './UnsupportedFilePreview'
import { useI18n } from '../i18n'
import { IconButton, useConfirm, useToast } from './ui'
import { eventToChord, useShortcuts, useShortcutTitle } from '../shortcuts'
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
  /** Reports the editor's unsaved-changes state up, so the owner can guard
      file switches and closes behind a confirm instead of dropping edits. */
  onDirtyChange?: (dirty: boolean) => void
}

/** Pretty-print JSON when possible; fall back to the raw text on parse errors. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function FilePreviewPanel({ file, onClose, onDirtyChange }: Props): JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const shortcutTitle = useShortcutTitle()
  const { shortcuts } = useShortcuts()
  const type = useMemo(() => getFilePreviewType(file), [file])
  // Build the CodeMirror language once per file — a new Extension identity would
  // tear down and recreate the whole editor (losing scroll/find) on every render.
  const language = useMemo(() => {
    if (type === 'json') return jsonLang()
    if (type === 'code') return getCodeMirrorLanguage(file)
    return null
  }, [type, file])
  const toast = useToast()
  const [data, setData] = useState<FileReadResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The content currently in the editor (kept in a ref so per-keystroke edits
  // don't re-render the panel and feed a new `content` prop back into CodeMirror,
  // which would tear the editor down). `baseline` is what's on disk — comparing
  // the two drives the dirty indicator and gates saving. `mtime` is the disk
  // mtime the baseline was read at, checked again before writing so a stale
  // preview never silently clobbers a file an agent has since rewritten.
  const liveContentRef = useRef('')
  const baselineRef = useRef('')
  const baselineMtimeRef = useRef<number | undefined>(undefined)

  // Mirror dirty state up (and always clear it on unmount so a discarded
  // editor doesn't leave the guard armed).
  useEffect(() => {
    onDirtyChange?.(dirty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])
  useEffect(
    () => () => onDirtyChange?.(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const openRaw = (): void => void window.api.openPath(file.path)
  const copyPath = (): void => {
    void navigator.clipboard.writeText(file.path)
    toast.success(t('preview.copied'))
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setData(null)
    setDirty(false)
    setSaveError(null)
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
      .catch(() => {
        // A rejected IPC would otherwise leave the panel on "Loading…" forever;
        // data stays null, which renders as the unavailable state.
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [file.path, type])

  // A file with a text-ish extension that's actually binary → fall back.
  const effectiveType =
    data && (type === 'code' || type === 'json' || type === 'markdown') && data.isBinary
      ? 'unsupported'
      : type

  // The exact text shown in the editor (raw code, or pretty-printed JSON). This
  // is the save unit and the dirty baseline; null when the file isn't editable.
  const editorText = useMemo(() => {
    if (!data || data.error) return null
    if (effectiveType === 'json') return prettyJson(data.content)
    if (effectiveType === 'code') return data.content
    return null
  }, [data, effectiveType])

  // Editing is only safe on a fully-loaded text file — never a truncated one,
  // since saving would write back just the partial content we loaded.
  const editable = editorText != null && !!data && !data.truncated

  // Seed the baseline whenever a new file's content loads.
  useEffect(() => {
    baselineRef.current = editorText ?? ''
    liveContentRef.current = editorText ?? ''
    baselineMtimeRef.current = data?.mtimeMs
    setDirty(false)
  }, [editorText, data?.mtimeMs])

  const handleChange = useCallback((value: string) => {
    liveContentRef.current = value
    setDirty(value !== baselineRef.current)
    setSaveError(null)
  }, [])

  const save = useCallback(async () => {
    if (!editable || saving || liveContentRef.current === baselineRef.current) return
    setSaving(true)
    setSaveError(null)
    const next = liveContentRef.current
    // Agents in the embedded terminals rewrite files constantly — a save from a
    // stale baseline would silently clobber their output, so re-stat first.
    const current = await window.api.readFile(file.path, {
      maxBytes: 0,
      asBase64: false,
      read: false
    })
    if (
      !current.error &&
      baselineMtimeRef.current !== undefined &&
      current.mtimeMs !== undefined &&
      current.mtimeMs !== baselineMtimeRef.current
    ) {
      setSaving(false)
      const overwrite = await confirm({
        title: t('preview.changedOnDiskTitle'),
        message: t('preview.changedOnDiskConfirm'),
        confirmLabel: t('preview.overwrite'),
        tone: 'danger'
      })
      if (!overwrite) return
      setSaving(true)
    }
    const res = await window.api.writeFile(file.path, next)
    if (res.ok) {
      baselineRef.current = next
      setDirty(liveContentRef.current !== next)
      // Refresh the baseline mtime to the just-written state.
      const after = await window.api.readFile(file.path, {
        maxBytes: 0,
        asBase64: false,
        read: false
      })
      if (!after.error) baselineMtimeRef.current = after.mtimeMs
    } else {
      setSaveError(res.error ?? t('preview.saveFailed'))
    }
    setSaving(false)
  }, [editable, saving, file.path, t, confirm])

  // Save on the configured shortcut (⌘/Ctrl+S by default), even when focus is
  // inside the editor. Capture so it beats CodeMirror and the browser's own save.
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return
      if (eventToChord(e) === shortcuts.saveFile) {
        e.preventDefault()
        e.stopPropagation()
        void save()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editable, shortcuts.saveFile, save])

  const renderBody = (): JSX.Element => {
    if (loading || !data) {
      return <div className="grid h-full place-items-center text-xs text-fgmuted">{t('preview.loading')}</div>
    }
    if (data.error) {
      return <div className="grid h-full place-items-center px-6 text-center text-xs text-danger">{data.error}</div>
    }

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
      case 'code':
        return (
          <div className="flex h-full min-h-0 flex-col">
            {data.truncated && <TruncatedWarning onOpenRaw={openRaw} />}
            <div className="min-h-0 flex-1">
              <CodeFilePreview
                content={editorText ?? data.content}
                language={language}
                editable={editable}
                onChange={handleChange}
              />
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
    <div data-preview-panel className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-bar px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-medium text-fg" title={file.name}>
              {file.name}
            </div>
            {dirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                title={t('preview.unsaved')}
                aria-label={t('preview.unsaved')}
              />
            )}
          </div>
          <div
            className={`truncate text-[11px] ${saveError ? 'text-danger' : 'text-fgmuted'}`}
            title={saveError ?? file.path}
          >
            {saveError ?? (
              <>
                {file.path}
                {data && !loading && !data.error && ` · ${formatBytes(data.size)}`}
              </>
            )}
          </div>
        </div>

        {editable && (
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            title={shortcutTitle(t('common.save'), 'saveFile')}
            className="shrink-0 rounded border border-edge px-2 py-1 text-xs font-medium text-fg transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {t('common.save')}
          </button>
        )}

        <IconButton label={t('preview.copyPath')} onClick={copyPath}>
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M3.5 10.5h-.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v.5" />
          </svg>
        </IconButton>

        <IconButton label={t('preview.openRaw')} onClick={openRaw}>
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 2.5h4.5V7" />
            <path d="M13.5 2.5 7 9" />
            <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
          </svg>
        </IconButton>

        <IconButton
          label={t('window.close')}
          title={shortcutTitle(t('window.close'), 'closePreview')}
          onClick={onClose}
        >
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
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-warnBorder bg-warnBg/60 px-3 py-1.5 text-[11px] text-warn">
      <span>{t('preview.truncated')}</span>
      <button onClick={onOpenRaw} className="shrink-0 font-medium underline-offset-2 hover:underline">
        {t('preview.openRaw')}
      </button>
    </div>
  )
}
