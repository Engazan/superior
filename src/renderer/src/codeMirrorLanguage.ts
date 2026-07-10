import type { Extension } from '@codemirror/state'

/** Lower-case extension without the dot, including known dotfiles. */
function extension(fileName: string): string {
  const name = fileName.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name.replace(/^\./, '') : name.slice(dot + 1)
}

/**
 * Load syntax support only for the preview being opened. Language packages are
 * sizeable and were previously pulled into every file-preview chunk, including
 * image and plain-text previews.
 */
export async function loadCodeMirrorLanguage(fileName: string): Promise<Extension | null> {
  switch (extension(fileName)) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs': {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ jsx: true })
    }
    case 'ts':
    case 'mts':
    case 'cts': {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ typescript: true })
    }
    case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ jsx: true, typescript: true })
    }
    case 'py': {
      const { python } = await import('@codemirror/lang-python')
      return python()
    }
    case 'html':
    case 'htm':
    case 'vue':
    case 'svelte':
    case 'astro': {
      const { html } = await import('@codemirror/lang-html')
      return html()
    }
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'styl': {
      const { css } = await import('@codemirror/lang-css')
      return css()
    }
    case 'json':
    case 'jsonc':
    case 'json5': {
      const { json } = await import('@codemirror/lang-json')
      return json()
    }
    case 'md':
    case 'markdown':
    case 'mdx': {
      const { markdown } = await import('@codemirror/lang-markdown')
      return markdown()
    }
    default:
      return null
  }
}
