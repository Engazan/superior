import { useState } from 'react'
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

export function MarkdownFilePreview({ content }: Props): JSX.Element {
  const { t } = useI18n()
  const [raw, setRaw] = useState(false)

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
          <CodeFilePreview content={content} language={markdown()} wrap />
        </div>
      ) : (
        <div className="md-preview min-h-0 flex-1 overflow-auto px-4 py-3 text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeHighlight, [rehypeSanitize, schema]]}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
