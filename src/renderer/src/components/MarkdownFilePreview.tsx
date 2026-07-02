import { useMemo, useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import { markdown } from '@codemirror/lang-markdown'
import 'highlight.js/styles/github-dark.css'
import { CodeFilePreview } from './CodeFilePreview'
import { useI18n } from '../i18n'

interface Props {
  content: string
}

// Allow the class names highlight.js adds; otherwise sanitize strips them.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className']]
  }
}

// Constant plugin pipelines — built once so ReactMarkdown isn't handed a new
// array identity (and forced to re-process) on every parent render.
type MarkdownProps = ComponentProps<typeof ReactMarkdown>

// highlight.js runs synchronously on the UI thread while the document parses;
// past this size the open-jank costs more than colored code blocks are worth.
const HIGHLIGHT_MAX_BYTES = 200 * 1024

export function MarkdownFilePreview({ content }: Props): JSX.Element {
  const { t } = useI18n()
  const [raw, setRaw] = useState(false)

  const highlight = content.length <= HIGHLIGHT_MAX_BYTES
  const remarkPlugins = useMemo<MarkdownProps['remarkPlugins']>(() => [remarkGfm], [])
  const rehypePlugins = useMemo<MarkdownProps['rehypePlugins']>(
    () =>
      highlight
        ? [rehypeRaw, rehypeHighlight, [rehypeSanitize, schema]]
        : [rehypeRaw, [rehypeSanitize, schema]],
    [highlight]
  )
  const mdLanguage = useMemo(() => markdown(), [])

  const segBtn = (active: boolean): string =>
    `px-2 py-0.5 text-[11px] font-medium rounded transition ${
      active ? 'bg-accentBg text-accent' : 'text-fgmuted hover:text-fg'
    }`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-edge px-3 py-1.5">
        <button className={segBtn(!raw)} onClick={() => setRaw(false)}>
          {t('preview.rendered')}
        </button>
        <button className={segBtn(raw)} onClick={() => setRaw(true)}>
          {t('preview.raw')}
        </button>
      </div>

      {raw ? (
        <div className="min-h-0 flex-1">
          <CodeFilePreview content={content} language={mdLanguage} wrap />
        </div>
      ) : (
        <div className="md-preview min-h-0 flex-1 overflow-auto px-4 py-3 text-sm">
          <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
