import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
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
  /** One-based line to select and scroll into view after the editor mounts. */
  initialLine?: number
  revealRequestId?: number
  /** Soft-wrap long lines (used for prose-ish content). */
  wrap?: boolean
  /** Optional source-line mapping for snippets with non-local line numbers. */
  sourceLineNumbers?: readonly (number | null)[]
  /** Static highlighted range inside a one-based local document line. */
  highlightRange?: { line: number; from: number; to: number }
  /** Remove editor padding so a fixed-line snippet fits its viewport exactly. */
  compact?: boolean
  /** Enable in-editor Cmd/Ctrl+F. Defaults to true. */
  searchable?: boolean
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

const compactTheme = EditorView.theme({
  '.cm-content': { padding: '0' },
  '.cm-line': { paddingLeft: '8px', paddingRight: '8px' },
  '.cm-gutters': { borderRight: '1px solid var(--c-edge)' }
})

const staticHighlightTheme = EditorView.theme({
  '.cm-searchPreviewLine': {
    backgroundColor: 'color-mix(in srgb, var(--c-warn-bg) 72%, transparent)'
  },
  '.cm-searchPreviewMatch': {
    backgroundColor: 'color-mix(in srgb, var(--c-warn) 30%, transparent)',
    borderRadius: '2px',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--c-warn) 28%, transparent)'
  }
})

function staticHighlight(
  content: string,
  range: NonNullable<Props['highlightRange']>
): Extension {
  const lines = content.split('\n')
  const lineNumber = Math.max(1, Math.min(range.line, lines.length))
  let lineFrom = 0
  for (let index = 0; index < lineNumber - 1; index += 1) {
    lineFrom += lines[index].length + 1
  }
  const lineLength = lines[lineNumber - 1].length
  const markFrom = lineFrom + Math.max(0, Math.min(range.from, lineLength))
  const markTo = lineFrom + Math.max(range.from, Math.min(range.to, lineLength))
  const decorations = [Decoration.line({ class: 'cm-searchPreviewLine' }).range(lineFrom)]
  if (markTo > markFrom) {
    decorations.push(Decoration.mark({ class: 'cm-searchPreviewMatch' }).range(markFrom, markTo))
  }
  return [EditorView.decorations.of(Decoration.set(decorations, true)), staticHighlightTheme]
}

/**
 * Source viewer with in-file find (Cmd/Ctrl+F). Read-only by default; pass
 * `editable` to turn it into a lightweight editor (history, indent, active-line)
 * that reports every change through `onChange`. The document is uncontrolled —
 * the parent seeds it via `content` and reads edits back through `onChange`, so
 * a re-render with the same `content` never tears the editor down mid-edit.
 */
export function CodeFilePreview({
  content,
  language,
  initialLine,
  revealRequestId,
  wrap,
  sourceLineNumbers,
  highlightRange,
  compact,
  searchable = true,
  editable,
  onChange
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const extensions: Extension[] = [
      lineNumbers(
        sourceLineNumbers
          ? {
              formatNumber: (lineNumber) => {
                const sourceLine = sourceLineNumbers[lineNumber - 1]
                return sourceLine == null ? '' : String(sourceLine)
              }
            }
          : undefined
      ),
      highlightSpecialChars(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      baseTheme
    ]
    if (searchable) {
      extensions.push(highlightSelectionMatches(), search({ top: true }), keymap.of(searchKeymap))
    }
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
    if (compact) extensions.push(compactTheme)
    if (highlightRange) extensions.push(staticHighlight(content, highlightRange))
    if (language) extensions.push(language)

    const view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: host
    })
    viewRef.current = view

    // Open the find panel on Cmd/Ctrl+F — but only when focus is inside this
    // preview. A window-wide capture here used to hijack ⌘F from the focused
    // terminal (its own scrollback search) for as long as any preview was open.
    const onKey = (e: KeyboardEvent): void => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'f' || e.key === 'F')
      ) {
        if (!host.contains(document.activeElement)) return
        e.preventDefault()
        e.stopPropagation()
        view.focus()
        openSearchPanel(view)
      }
    }
    if (searchable) window.addEventListener('keydown', onKey, true)

    return () => {
      if (searchable) window.removeEventListener('keydown', onKey, true)
      viewRef.current = null
      view.destroy()
    }
  }, [content, language, wrap, sourceLineNumbers, highlightRange, compact, searchable, editable, onChange])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !initialLine) return
    const line = view.state.doc.line(Math.min(initialLine, view.state.doc.lines))
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
    view.focus()
  }, [content, initialLine, revealRequestId])

  return <div ref={hostRef} className="h-full overflow-hidden" />
}
