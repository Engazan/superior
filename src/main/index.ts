import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerWorkspaceIpc } from './ipc/workspace.ipc'
import { registerWorktreeIpc } from './ipc/worktree.ipc'
import { reconcileWorktrees } from './services/workspace.service'
import { registerAgentIpc } from './ipc/agent.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerPresetsIpc } from './ipc/presets.ipc'
import { registerWindowIpc, attachWindowMaximizeEvents } from './ipc/window.ipc'
import { registerLayoutIpc } from './ipc/layout.ipc'
import { registerGitIpc } from './ipc/git.ipc'
import { registerFsIpc } from './ipc/fs.ipc'
import { daemonClient } from './services/daemonClient'

const isMac = process.platform === 'darwin'

// Display name for the macOS app menu, About panel, tray and notifications. Must
// be set before `ready`; otherwise dev runs inherit "Electron" from the bundle.
// On macOS the userData dir is case-insensitive, so this keeps the existing
// "superior" storage path. Packaged builds get the name from `build.productName`.
app.setName('Superior')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 480,
    show: false,
    backgroundColor: '#181825',
    title: 'Superior',
    // macOS: keep the native traffic lights (inset) with a custom draggable bar.
    // Other platforms: fully frameless with our own window controls.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 10 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer displays untrusted repo content (markdown, source), so keep
      // the sandbox on as defense-in-depth. node-pty lives in the daemon, and the
      // preload only touches electron + process.platform, so this is safe.
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())
  attachWindowMaximizeEvents(win)

  // Open target=_blank / external links in the system browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  // Branded About panel (⌘? / app menu) instead of the default Electron one.
  app.setAboutPanelOptions({
    applicationName: 'Superior',
    applicationVersion: app.getVersion()
  })

  registerWorkspaceIpc()
  registerWorktreeIpc()
  registerAgentIpc()
  registerSettingsIpc()
  registerPresetsIpc()
  registerWindowIpc()
  registerLayoutIpc()
  registerGitIpc()
  registerFsIpc()

  // Connect to (or launch) the terminal daemon so surviving sessions can be restored.
  daemonClient.ensure().catch((err) => console.error('[daemon] connect failed:', err))

  // Reconcile worktree-backed workspaces before the renderer reads state, so a
  // vanished worktree never leaves an agent launching in a stale cwd.
  await reconcileWorktrees()
    .then((warnings) => warnings.forEach((w) => console.warn('[worktree]', w)))
    .catch((err) => console.error('[worktree] reconcile failed:', err))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // PTYs live in the daemon and intentionally survive — do not kill them here.
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Detach from the daemon without killing sessions, so they persist.
  daemonClient.disconnect()
})
