import { StreamLanguage } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

/** Lower-case extension without the dot, including known dotfiles. */
function extension(fileName: string): string {
  const name = fileName.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name.replace(/^\./, '') : name.slice(dot + 1)
}

/**
 * Load syntax support only for the preview being opened. Keeping every parser
 * behind a dynamic import gives common languages first-class highlighting
 * without pulling all of them into Superior's initial renderer bundle.
 */
export async function loadCodeMirrorLanguage(fileName: string): Promise<Extension | null> {
  const ext = extension(fileName)

  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs': {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript()
    }
    case 'jsx': {
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
    case 'php': {
      const { php } = await import('@codemirror/lang-php')
      return php()
    }
    case 'c':
    case 'h':
    case 'cc':
    case 'cpp':
    case 'hpp':
    case 'java':
    case 'cs':
    case 'dart':
    case 'kt':
    case 'kts':
    case 'scala': {
      const modes = await import('@codemirror/legacy-modes/mode/clike')
      const parsers = {
        c: modes.c,
        h: modes.c,
        cc: modes.cpp,
        cpp: modes.cpp,
        hpp: modes.cpp,
        java: modes.java,
        cs: modes.csharp,
        dart: modes.dart,
        kt: modes.kotlin,
        kts: modes.kotlin,
        scala: modes.scala
      } as const
      return StreamLanguage.define(parsers[ext as keyof typeof parsers])
    }
    case 'go': {
      const { go } = await import('@codemirror/legacy-modes/mode/go')
      return StreamLanguage.define(go)
    }
    case 'rs': {
      const { rust } = await import('@codemirror/legacy-modes/mode/rust')
      return StreamLanguage.define(rust)
    }
    case 'swift': {
      const { swift } = await import('@codemirror/legacy-modes/mode/swift')
      return StreamLanguage.define(swift)
    }
    case 'html':
    case 'htm':
    case 'svelte':
    case 'astro':
    case 'vue': {
      const { html } = await import('@codemirror/lang-html')
      return html()
    }
    case 'xml': {
      const { xml } = await import('@codemirror/legacy-modes/mode/xml')
      return StreamLanguage.define(xml)
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css')
      return css()
    }
    case 'scss':
    case 'less': {
      const modes = await import('@codemirror/legacy-modes/mode/css')
      return StreamLanguage.define(ext === 'scss' ? modes.sCSS : modes.less)
    }
    case 'sass': {
      const { sass } = await import('@codemirror/legacy-modes/mode/sass')
      return StreamLanguage.define(sass)
    }
    case 'styl': {
      const { stylus } = await import('@codemirror/legacy-modes/mode/stylus')
      return StreamLanguage.define(stylus)
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
    case 'yaml':
    case 'yml': {
      const { yaml } = await import('@codemirror/legacy-modes/mode/yaml')
      return StreamLanguage.define(yaml)
    }
    case 'sql': {
      const { standardSQL } = await import('@codemirror/legacy-modes/mode/sql')
      return StreamLanguage.define(standardSQL)
    }
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish': {
      const { shell } = await import('@codemirror/legacy-modes/mode/shell')
      return StreamLanguage.define(shell)
    }
    case 'rb': {
      const { ruby } = await import('@codemirror/legacy-modes/mode/ruby')
      return StreamLanguage.define(ruby)
    }
    case 'lua': {
      const { lua } = await import('@codemirror/legacy-modes/mode/lua')
      return StreamLanguage.define(lua)
    }
    case 'pl': {
      const { perl } = await import('@codemirror/legacy-modes/mode/perl')
      return StreamLanguage.define(perl)
    }
    case 'r': {
      const { r } = await import('@codemirror/legacy-modes/mode/r')
      return StreamLanguage.define(r)
    }
    case 'ps1': {
      const { powerShell } = await import('@codemirror/legacy-modes/mode/powershell')
      return StreamLanguage.define(powerShell)
    }
    case 'properties':
    case 'ini':
    case 'env':
    case 'editorconfig': {
      const { properties } = await import('@codemirror/legacy-modes/mode/properties')
      return StreamLanguage.define(properties)
    }
    case 'toml': {
      const { toml } = await import('@codemirror/legacy-modes/mode/toml')
      return StreamLanguage.define(toml)
    }
    case 'proto': {
      const { protobuf } = await import('@codemirror/legacy-modes/mode/protobuf')
      return StreamLanguage.define(protobuf)
    }
    case 'diff':
    case 'patch': {
      const { diff } = await import('@codemirror/legacy-modes/mode/diff')
      return StreamLanguage.define(diff)
    }
    case 'dockerfile': {
      const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile')
      return StreamLanguage.define(dockerFile)
    }
    case 'tex': {
      const { stex } = await import('@codemirror/legacy-modes/mode/stex')
      return StreamLanguage.define(stex)
    }
    default:
      return null
  }
}
