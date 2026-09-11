import { WebContentsView, session, type BrowserWindow, type IpcMainEvent } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import {
  BROWSER_IPC, browserKeyChord, browserUrl, buildDesignPrompt, clipBrowserBounds, validBrowserBounds, validBrowserElement,
  type BrowserDesignRequest, type BrowserRequest, type BrowserSelection, type BrowserState
} from '@shared/browser'
import { getSettings } from './settings.service'
import type { ShortcutAction } from '@shared/types'
import { listWorkspaces } from './workspace.service'
import { saveClipboardImage } from './clipboard.service'
import { sendReview } from './diff-review.service'

interface Preview {
  workspaceId: string
  owner: BrowserWindow
  view: WebContentsView
  state: BrowserState
  visible: boolean
  epoch: number
  capturing: boolean
  selection?: BrowserSelection
  image?: Uint8Array
}

/** Owns unprivileged browser views; only the app renderer can control them. */
export class BrowserService {
  private previews = new Map<string, Preview>()
  private key(owner: BrowserWindow, id: string): string { return `${owner.id}:${id}` }

  private publish(preview: Preview): BrowserState {
    const wc = preview.view.webContents
    if (!wc.isDestroyed()) {
      preview.state = { ...preview.state, url: preview.state.url,
        title: wc.getTitle(), loading: wc.isLoading(),
        canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() }
    }
    if (!preview.owner.isDestroyed()) preview.owner.webContents.send(BROWSER_IPC.STATE, preview.state)
    return preview.state
  }

  private workspace(id: string) {
    const all = listWorkspaces()
    const workspace = all.workspaces.find((item) => item.id === id)
    if (!workspace) throw new Error('Workspace no longer exists.')
    return workspace
  }

  private create(owner: BrowserWindow, workspaceId: string): Preview {
    const partition = session.fromPartition(`superior-preview-${randomUUID()}`)
    partition.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    partition.setPermissionCheckHandler(() => false)
    partition.on('will-download', (event) => event.preventDefault())
    const view = new WebContentsView({ webPreferences: {
      preload: join(__dirname, '../preload/browser.js'),
      session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: false, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, navigateOnDragDrop: false
    } })
    const preview: Preview = { owner, workspaceId, view, visible: false, epoch: 0, capturing: false,
      state: { workspaceId, url: '', title: '', loading: false, canGoBack: false, canGoForward: false, designMode: false, error: null } }
    this.previews.set(this.key(owner, workspaceId), preview)
    owner.contentView.addChildView(view)
    view.setVisible(false)
    const wc = view.webContents
    wc.setZoomFactor(1)
    wc.on('before-input-event', (event, input) => {
      if (!preview.visible || input.type !== 'keyDown' || input.isAutoRepeat || input.isComposing ||
        !(input.meta || input.control || input.alt)) return
      const chord = browserKeyChord(input, process.platform === 'darwin')
      const actions: ShortcutAction[] = ['toggleWorkspaceMode', 'closeFocusedCell', 'toggleSidebar', 'toggleRightPanel',
        'openSettings', 'openLauncher', 'openPalette', 'searchFileContents', 'prevWorkspace', 'nextWorkspace', 'prevProfile', 'nextProfile', 'manageProfiles']
      const shortcuts = getSettings().shortcuts
      if (chord !== 'mod+l' && !actions.some((action) => shortcuts[action] === chord)) return
      event.preventDefault()
      owner.webContents.focus()
      owner.webContents.send(BROWSER_IPC.KEY, { workspaceId, key: input.key, code: input.code,
        control: input.control, meta: input.meta, alt: input.alt, shift: input.shift, address: chord === 'mod+l' })
    })
    wc.setWindowOpenHandler(({ url }) => {
      try { this.navigate(preview, browserUrl(url)) } catch { /* External protocols cannot escape the preview. */ }
      return { action: 'deny' }
    })
    wc.on('will-navigate', (event, url) => {
      try { browserUrl(url) } catch { event.preventDefault() }
    })
    wc.on('will-redirect', (event, url) => {
      try { browserUrl(url) } catch { event.preventDefault() }
    })
    wc.on('will-attach-webview', (event) => event.preventDefault())
    wc.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        ++preview.epoch
        preview.state.error = null
        preview.state.designMode = false
      }
    })
    wc.on('dom-ready', () => {
      wc.send(BROWSER_IPC.PICK_MODE, preview.state.designMode)
      this.publish(preview)
    })
    wc.on('did-start-loading', () => this.publish(preview))
    wc.on('did-stop-loading', () => this.publish(preview))
    wc.on('did-navigate', (_event, url) => { preview.state.url = url; this.publish(preview) })
    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame) preview.state.url = url; this.publish(preview) })
    wc.on('page-title-updated', () => this.publish(preview))
    wc.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return
      preview.state.error = description
      this.publish(preview)
    })
    wc.on('render-process-gone', () => {
      preview.state.error = 'Preview process stopped. Reload to reconnect.'
      preview.state.designMode = false
      this.publish(preview)
    })
    return preview
  }

  private navigate(preview: Preview, url: string): void {
    preview.state.url = url
    preview.state.error = null
    preview.state.designMode = false
    if (preview.visible) preview.view.setVisible(true)
    preview.view.webContents.send(BROWSER_IPC.PICK_MODE, false)
    void preview.view.webContents.loadURL(url).catch(() => { /* did-fail-load publishes the useful error. */ })
  }

  request(owner: BrowserWindow, args: BrowserRequest): BrowserState | null {
    if (!args || typeof args.workspaceId !== 'string' || !args.workspaceId || args.workspaceId.length > 256) throw new Error('Invalid browser request.')
    const key = this.key(owner, args.workspaceId)
    let preview = this.previews.get(key)
    if (args.type === 'dispose') { if (preview) this.dispose(preview); return null }
    if (args.type === 'hide') {
      if (preview) { preview.visible = false; preview.view.setVisible(false) }
      return preview?.state ?? null
    }
    this.workspace(args.workspaceId)
    if (args.type === 'show') {
      if (!validBrowserBounds(args.bounds)) throw new Error('Invalid browser bounds.')
      const [width, height] = owner.getContentSize()
      const bounds = clipBrowserBounds(args.bounds, width, height)
      if (!bounds.width || !bounds.height) return preview?.state ?? null
      // Validate before creating a new view; persisted URLs are untrusted input too.
      const initial = args.initialUrl ? browserUrl(args.initialUrl) : null
      const fresh = !preview
      preview ??= this.create(owner, args.workspaceId)
      for (const other of this.previews.values()) {
        if (other.owner === owner && other !== preview) { other.visible = false; other.view.setVisible(false) }
      }
      preview.view.setBounds(bounds)
      preview.visible = true
      preview.view.setVisible(!!preview.state.url)
      if (fresh && initial) this.navigate(preview, initial)
      return this.publish(preview)
    }
    if (!preview) throw new Error('Open Browser before navigating.')
    const wc = preview.view.webContents
    switch (args.type) {
      case 'navigate': this.navigate(preview, browserUrl(args.url)); break
      case 'reload': preview.state.error = null; wc.reload(); break
      case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break
      case 'forward': if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break
      case 'design':
        if (typeof args.enabled !== 'boolean') throw new Error('Invalid design mode.')
        preview.state.designMode = args.enabled
        wc.send(BROWSER_IPC.PICK_MODE, args.enabled)
        break
      default: throw new Error('Invalid browser action.')
    }
    return this.publish(preview)
  }

  async pick(event: IpcMainEvent, data: unknown): Promise<void> {
    const preview = [...this.previews.values()].find((item) => item.view.webContents === event.sender)
    if (!preview || event.senderFrame !== event.sender.mainFrame || !preview.visible || !preview.state.designMode || preview.capturing) return
    preview.state.designMode = false
    event.sender.send(BROWSER_IPC.PICK_MODE, false)
    if (data === null) { this.publish(preview); return }
    if (!validBrowserElement(data) || data.url !== event.sender.getURL()) { this.publish(preview); return }
    const bounds = preview.view.getBounds()
    const rect = clipBrowserBounds(data.rect, bounds.width, bounds.height)
    if (!rect.width || !rect.height) { this.publish(preview); return }
    const epoch = preview.epoch
    preview.capturing = true
    try {
      const image = await event.sender.capturePage(rect)
      if (epoch !== preview.epoch || event.sender.isDestroyed() || !preview.visible || image.isEmpty()) return
      const resized = image.getSize().width > 1600 ? image.resize({ width: 1600 }) : image
      preview.image = resized.toPNG()
      preview.selection = { ...data, rect, id: randomUUID(), workspaceId: preview.workspaceId, screenshot: resized.toDataURL() }
      // Hide the native view before opening the renderer's comment dialog.
      preview.visible = false
      preview.view.setVisible(false)
      preview.owner.webContents.send(BROWSER_IPC.SELECTION, preview.selection)
    } catch {
      preview.state.error = 'Could not capture the selected element. Try selecting it again.'
    } finally { preview.capturing = false; this.publish(preview) }
  }

  async send(owner: BrowserWindow, args: BrowserDesignRequest): Promise<void> {
    if (!args || typeof args.workspaceId !== 'string' || typeof args.selectionId !== 'string' ||
      typeof args.sessionId !== 'string' || typeof args.instruction !== 'string' || !args.instruction.trim() || args.instruction.length > 10000) {
      throw new Error('Invalid design request.')
    }
    const preview = this.previews.get(this.key(owner, args.workspaceId))
    if (!preview?.selection || !preview.image || preview.selection.id !== args.selectionId) throw new Error('Select the element again.')
    const workspace = this.workspace(args.workspaceId)
    const folder = workspace.worktreePath ?? workspace.folderPath
    const selection = preview.selection
    const image = preview.image
    const imagePath = (await saveClipboardImage(image, 'png')).path
    await sendReview({ workspaceId: args.workspaceId, sessionId: args.sessionId, folderPath: folder,
      prompt: buildDesignPrompt(selection, args.instruction, imagePath, folder) })
  }

  private dispose(preview: Preview): void {
    ++preview.epoch
    preview.visible = false
    this.previews.delete(this.key(preview.owner, preview.workspaceId))
    if (!preview.owner.isDestroyed()) preview.owner.contentView.removeChildView(preview.view)
    if (!preview.view.webContents.isDestroyed()) preview.view.webContents.close({ waitForBeforeUnload: false })
  }

  closeWindow(owner: BrowserWindow): void {
    for (const preview of [...this.previews.values()]) if (preview.owner === owner) this.dispose(preview)
  }

}
