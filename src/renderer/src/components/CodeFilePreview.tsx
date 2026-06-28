import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightSpecialChars,
  highlightActiveLine,
  highlightActiveLineGutter
} from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import {
  search,
  searchKeymap,
  openSearchPanel,
  highlightSelectionMatches
} from '@codemirror/search'

interface Props {
  content: string
  /** CodeMirror language extension, or null for plain text. */
  language: Extension | null
  /** Soft-wrap long lines (used for prose-ish content). */
  wrap?: boolean
  /** Allow editing the document. When false (default) the view is read-only. */
  editable?: boolean
  /** Called with the full document text on every edit (only while `editable`). */
  onChange?: (value: string) => void
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
  // Find panel (Cmd/Ctrl+F) — themed to match the app.
  '.cm-panels': { backgroundColor: 'var(--c-bar)', color: 'var(--c-fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--c-edge)' },
  '.cm-textfield': {
    backgroundColor: 'var(--c-panel)',
    color: 'var(--c-fg)',
    border: '1px solid var(--c-edge)'
  },
  '.cm-button': {
    backgroundColor: 'var(--c-panel)',
    backgroundImage: 'none',
    color: 'var(--c-fg)',
    border: '1px solid var(--c-edge)'
  },
  '.cm-searchMatch': { backgroundColor: 'rgba(250, 204, 21, 0.3)' },
  '.cm-searchMatch-selected': { backgroundColor: 'rgba(250, 204, 21, 0.6)' }
})

// A preview is a passive viewer: hide the caret and don't highlight the line.
const readOnlyChrome = EditorView.theme({
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-cursor': { display: 'none' },
  '.cm-content': { caretColor: 'transparent' }
})

/**
 * Source viewer with in-file find (Cmd/Ctrl+F). Read-only by default; pass
 * `editable` to turn it into a lightweight editor (history, indent, active-line)
 * that reports every change through `onChange`. The document is uncontrolled —
 * the parent seeds it via `content` and reads edits back through `onChange`, so
 * a re-render with the same `content` never tears the editor down mid-edit.
 */
export function CodeFilePreview({ content, language, wrap, editable, onChange }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const extensions: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightSelectionMatches(),
      search({ top: true }),
      keymap.of(searchKeymap),
      baseTheme
    ]
    if (editable) {
      extensions.push(
        history(),
        indentOnInput(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange?.(u.state.doc.toString())
        })
      )
    } else {
      extensions.push(readOnlyChrome, EditorState.readOnly.of(true), EditorView.editable.of(false))
    }
    if (wrap) extensions.push(EditorView.lineWrapping)
    if (language) extensions.push(language)

    const view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: host
    })

    // Open the find panel on Cmd/Ctrl+F while a preview is showing, even when
    // focus isn't already inside the editor. Capture so it beats other handlers.
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        e.stopPropagation()
        view.focus()
        openSearchPanel(view)
      }
    }
    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      view.destroy()
    }
  }, [content, language, wrap, editable, onChange])

  return <div ref={hostRef} className="h-full overflow-hidden" />
}
