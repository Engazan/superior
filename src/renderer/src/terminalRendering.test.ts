import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/terminalSettings'
import { createTerminalRendering, rendererIsSupported } from './terminalRendering'

const addons = vi.hoisted(() => ({ webgl: [] as { dispose: ReturnType<typeof vi.fn>; loss?: () => void }[], ligatures: [] as { dispose: ReturnType<typeof vi.fn> }[] }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class {
  dispose = vi.fn()
  loss?: () => void
  constructor() { addons.webgl.push(this) }
  onContextLoss(callback: () => void): void { this.loss = callback }
} }))
vi.mock('@xterm/addon-ligatures', () => ({ LigaturesAddon: class {
  dispose = vi.fn()
  constructor() { addons.ligatures.push(this) }
} }))
beforeEach(() => { addons.webgl = []; addons.ligatures = [] })

describe('terminal renderer lifecycle', () => {
  it('keeps unknown and software GPU renderers out of Auto', () => {
    for (const renderer of ['', 'Google SwiftShader', 'llvmpipe', 'Microsoft Basic Render Driver']) expect(rendererIsSupported(renderer)).toBe(false)
    expect(rendererIsSupported('ANGLE (Apple, Apple M1, Metal)')).toBe(true)
  })
  it('enables ligatures before WebGL, reuses it on font size changes, and disposes on loss', async () => {
    const loadAddon = vi.fn()
    const controller = createTerminalRendering({ loadAddon } as unknown as Terminal)
    const settings = { ...DEFAULT_TERMINAL_SETTINGS, ligatures: 'on' as const, gpuAcceleration: 'on' as const }
    await controller.update(settings)
    expect(loadAddon.mock.calls.map(call => call[0])).toEqual([addons.ligatures[0], addons.webgl[0]])
    await controller.update({ ...settings, fontSize: 20 })
    expect(addons.webgl).toHaveLength(1)
    addons.webgl[0].loss?.()
    expect(addons.webgl[0].dispose).toHaveBeenCalledOnce()
    controller.dispose()
    expect(addons.ligatures[0].dispose).toHaveBeenCalledOnce()
  })
  it('falls back cleanly on activation failure and can be switched back on', async () => {
    let fail = true
    const controller = createTerminalRendering({ loadAddon: () => { if (fail) throw new Error('GPU unavailable') } } as unknown as Terminal)
    await expect(controller.update({ ...DEFAULT_TERMINAL_SETTINGS, gpuAcceleration: 'on' })).resolves.toBeUndefined()
    expect(addons.webgl[0].dispose).toHaveBeenCalledOnce()
    await controller.update({ ...DEFAULT_TERMINAL_SETTINGS, gpuAcceleration: 'off' })
    fail = false
    await controller.update({ ...DEFAULT_TERMINAL_SETTINGS, gpuAcceleration: 'on' })
    expect(addons.webgl).toHaveLength(2)
    controller.dispose()
    expect(addons.webgl[1].dispose).toHaveBeenCalledOnce()
  })
  it('does not attach a deferred addon after disposal or an Off update', async () => {
    const loadAddon = vi.fn()
    const controller = createTerminalRendering({ loadAddon } as unknown as Terminal)
    const pending = controller.update({ ...DEFAULT_TERMINAL_SETTINGS, gpuAcceleration: 'on', ligatures: 'on' })
    controller.dispose()
    await pending
    expect(loadAddon).not.toHaveBeenCalled()
  })
})
