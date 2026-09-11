import type { Terminal } from '@xterm/xterm'
import type { TerminalSettings } from '@shared/terminalSettings'
import type { WebglAddon } from '@xterm/addon-webgl'
import type { LigaturesAddon } from '@xterm/addon-ligatures'

export function rendererIsSupported(renderer: string): boolean {
  return !!renderer && !/swiftshader|llvmpipe|softpipe|software|microsoft basic/i.test(renderer)
}
let supported: boolean | undefined
function canUseGpu(): boolean {
  if (supported !== undefined) return supported
  supported = false
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    supported = !!info && rendererIsSupported(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { /* use the DOM renderer */ }
  return supported
}
export function wantsLigatures(s: TerminalSettings): boolean {
  return s.ligatures === 'on' || (s.ligatures === 'auto' && /fira|cascadia|iosevka|jetbrains|hasklig|monaspace/i.test(s.fontFamily))
}
/** One controller per terminal; stale imports cannot attach to disposed terminals. */
export function createTerminalRendering(term: Terminal): {
  update: (settings: TerminalSettings) => Promise<void>
  dispose: () => void
} {
  let generation = 0
  let lastKey = ''
  let webgl: WebglAddon | undefined
  let ligatures: LigaturesAddon | undefined
  const clear = (): void => {
    webgl?.dispose(); webgl = undefined
    ligatures?.dispose(); ligatures = undefined
  }
  return {
    async update(s) {
      const key = `${s.gpuAcceleration}:${wantsLigatures(s)}:${s.fontFamily}`
      if (key === lastKey) return
      lastKey = key
      const version = ++generation
      clear()
      // Ligatures must be activated before WebGL builds its texture atlas.
      if (wantsLigatures(s)) {
        try {
          const { LigaturesAddon } = await import('@xterm/addon-ligatures')
          if (version !== generation) return
          ligatures = new LigaturesAddon()
          term.loadAddon(ligatures)
        } catch { ligatures?.dispose(); ligatures = undefined }
      }
      if (version !== generation) return
      if (s.gpuAcceleration === 'off' || (s.gpuAcceleration === 'auto' && !canUseGpu())) return
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        if (version !== generation) return
        const addon = new WebglAddon()
        webgl = addon
        addon.onContextLoss(() => {
          if (webgl === addon) { addon.dispose(); webgl = undefined }
        })
        term.loadAddon(addon)
      } catch { webgl?.dispose(); webgl = undefined }
    },
    dispose() { ++generation; clear() }
  }
}
