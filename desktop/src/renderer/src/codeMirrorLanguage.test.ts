import { describe, expect, it } from 'vitest'
import { loadCodeMirrorLanguage } from './codeMirrorLanguage'

describe('loadCodeMirrorLanguage', () => {
  it.each([
    'index.php',
    'main.go',
    'lib.rs',
    'App.java',
    'native.cpp',
    'Program.cs',
    'Main.kt',
    'script.rb',
    'schema.sql',
    'config.yaml',
    'layout.xml',
    'styles.scss',
    'component.vue',
    'deploy.sh',
    'Dockerfile'
  ])('loads syntax support for %s', async (fileName) => {
    await expect(loadCodeMirrorLanguage(fileName)).resolves.not.toBeNull()
  })

  it.each(['settings.jsonc', 'data.json5', 'shell.zsh', 'shell.fish', 'Page.svelte', 'Page.astro'])(
    'maps common extension aliases for %s',
    async (fileName) => {
      await expect(loadCodeMirrorLanguage(fileName)).resolves.not.toBeNull()
    }
  )

  it('falls back to plain text for files without language support', async () => {
    await expect(loadCodeMirrorLanguage('notes.txt')).resolves.toBeNull()
  })
})
