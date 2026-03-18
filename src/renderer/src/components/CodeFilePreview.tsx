import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'

interface Props {
  content: string
  /** CodeMirror language extension, or null for plain text. */
  language: Extension | null
  /** Soft-wrap long lines (used for prose-ish content). */
  wrap?: boolean
}

// Chrome only — colours come from the app's CSS variables so it tracks the theme.
const baseTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--c-fg)' },
  '.cm-scroller': {
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: '12.5px',
    lineHeight: '1.55'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--c-fgmuted)',
    border: 'none'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-cursor': { display: 'none' },
  '.cm-content': { caretColor: 'transparent' }
})

/** Read-only source viewer. Never emits edits back; the document is immutable. */
export function CodeFilePreview({ content, language, wrap }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const extensions: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      baseTheme,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false)
    ]
    if (wrap) extensions.push(EditorView.lineWrapping)
    if (language) extensions.push(language)

    const view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: host
    })
    return () => view.destroy()
  }, [content, language, wrap])

  return <div ref={hostRef} className="h-full overflow-hidden" />
}
