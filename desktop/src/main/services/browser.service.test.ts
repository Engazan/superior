import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainEvent } from 'electron'
import { BROWSER_IPC, type BrowserElement } from '@shared/browser'

const mocks = vi.hoisted(() => ({ views: [] as FakeView[], sendReview: vi.fn(), saveImage: vi.fn(), permission: vi.fn() }))
// The view fake retains real event ordering and bounds, while capturePage returns a known PNG.
class FakeView {
  visible = false
  bounds = { x: 0, y: 0, width: 600, height: 400 }
  handlers = new Map<string, (...args: unknown[]) => void>()
  webContents = {
    url: '', mainFrame: {}, destroyed: false,
    isDestroyed: () => this.webContents.destroyed,
    getURL: () => this.webContents.url, getTitle: () => 'Fixture', isLoading: () => false,
    navigationHistory: { canGoBack: () => false, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() },
    setZoomFactor: vi.fn(), setWindowOpenHandler: vi.fn(), send: vi.fn(), reload: vi.fn(),
    on: (name: string, handler: (...args: unknown[]) => void) => { this.handlers.set(name, handler) },
    loadURL: vi.fn(async (url: string) => { this.webContents.url = url }),
    capturePage: vi.fn(async (_rect: unknown) => ({ isEmpty: () => false, getSize: () => ({ width: 200, height: 60 }),
      toPNG: () => Buffer.from('PNG'), toDataURL: () => 'data:image/png;base64,UE5H' })),
    close: vi.fn(() => { this.webContents.destroyed = true })
  }
  constructor() { mocks.views.push(this) }
  setBounds(bounds: typeof this.bounds) { this.bounds = bounds }
  getBounds() { return this.bounds }
  setVisible(value: boolean) { this.visible = value }
}
vi.mock('electron', () => ({
  get WebContentsView() { return FakeView },
  session: { fromPartition: () => ({ setPermissionRequestHandler: mocks.permission, setPermissionCheckHandler: vi.fn(), on: vi.fn() }) }
}))
vi.mock('./workspace.service', () => ({ listWorkspaces: () => ({ workspaces: [{ id: 'a', folderPath: '/repo/a' }, { id: 'b', folderPath: '/repo/b' }] }) }))
vi.mock('./settings.service', () => ({ getSettings: () => ({ shortcuts: {} }) }))
vi.mock('./clipboard.service', () => ({ saveClipboardImage: mocks.saveImage }))
vi.mock('./diff-review.service', () => ({ sendReview: mocks.sendReview }))
import { BrowserService } from './browser.service'

const owner = { id: 1, isDestroyed: () => false, getContentSize: () => [1000, 800],
  contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: { send: vi.fn(), focus: vi.fn() } } as unknown as BrowserWindow
const element: BrowserElement = { url: 'http://localhost:3000/', title: 'Fixture', selector: '#button', tagName: 'button',
  html: '<button>Save</button>', styles: 'color: blue;', text: 'Save', rect: { x: -10, y: 20, width: 100, height: 50 } }
const show = (service: BrowserService, id = 'a') => service.request(owner, { workspaceId: id, type: 'show',
  bounds: { x: 20, y: 80, width: 600, height: 400 }, initialUrl: element.url })
const event = (view: FakeView, frame = view.webContents.mainFrame) => ({ sender: view.webContents, senderFrame: frame }) as unknown as IpcMainEvent
beforeEach(() => { mocks.views.length = 0; vi.clearAllMocks(); mocks.saveImage.mockResolvedValue({ path: '/tmp/selected.png' }); mocks.sendReview.mockResolvedValue(undefined) })

describe('BrowserService', () => {
  it('isolates visible workspaces and closes native webContents on disposal', () => {
    const service = new BrowserService()
    show(service); show(service, 'b')
    expect(mocks.views.map((view) => view.visible)).toEqual([false, true])
    service.request(owner, { workspaceId: 'b', type: 'hide' })
    expect(mocks.views[1].visible).toBe(false)
    service.closeWindow(owner)
    for (const view of mocks.views) expect(view.webContents.close).toHaveBeenCalledExactlyOnceWith({ waitForBeforeUnload: false })
  })
  it('rejects unsupported URLs and unknown workspaces before allocating a native view', () => {
    const service = new BrowserService()
    expect(() => service.request(owner, { workspaceId:'a', type:'show',bounds:{x:0,y:0,width:100,height:100},initialUrl:'file:///secret' })).toThrow()
    expect(() => show(service,'missing')).toThrow()
    expect(mocks.views).toHaveLength(0)
  })
  it('ignores unsolicited, subframe, wrong-page and hidden picker messages', async () => {
    const service = new BrowserService(); show(service)
    const view = mocks.views[0]
    await service.pick(event(view),element)
    expect(view.webContents.capturePage).not.toHaveBeenCalled()
    service.request(owner,{workspaceId:'a',type:'design',enabled:true})
    await service.pick(event(view,{}),element)
    expect(view.webContents.capturePage).not.toHaveBeenCalled()
    await service.pick(event(view),{...element,url:'http://other/'})
    expect(view.webContents.capturePage).not.toHaveBeenCalled()
    service.request(owner,{workspaceId:'a',type:'design',enabled:true})
    service.request(owner,{workspaceId:'a',type:'hide'})
    await service.pick(event(view),element)
    expect(view.webContents.capturePage).not.toHaveBeenCalled()
  })
  it('crops the selection, hides the page and sends the PNG with context only for its workspace', async () => {
    const service = new BrowserService(); show(service)
    const view = mocks.views[0]
    service.request(owner,{workspaceId:'a',type:'design',enabled:true})
    await service.pick(event(view),element)
    expect(view.webContents.capturePage).toHaveBeenCalledWith({x:0,y:20,width:90,height:50})
    expect(view.visible).toBe(false)
    const selection = vi.mocked(owner.webContents.send).mock.calls.find(([channel]) => channel === BROWSER_IPC.SELECTION)![1]
    await expect(service.send(owner,{workspaceId:'b',selectionId:selection.id,sessionId:'agent',instruction:'Green'})).rejects.toThrow()
    await service.send(owner,{workspaceId:'a',selectionId:selection.id,sessionId:'agent',instruction:'Make it green'})
    expect(mocks.saveImage).toHaveBeenCalledWith(Buffer.from('PNG'),'png')
    expect(mocks.sendReview).toHaveBeenCalledWith(expect.objectContaining({workspaceId:'a',sessionId:'agent',folderPath:'/repo/a'}))
    const prompt=mocks.sendReview.mock.calls[0][0].prompt
    for(const value of ['Make it green','color: blue;','/tmp/selected.png','<button>Save</button>']) expect(prompt).toContain(value)
    // A viewport resize must not reopen the previously dismissed design dialog.
    vi.mocked(owner.webContents.send).mockClear()
    show(service)
    expect(vi.mocked(owner.webContents.send).mock.calls.some(([channel])=>channel===BROWSER_IPC.SELECTION)).toBe(false)
  })
})
