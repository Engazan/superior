import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/types'
import { addFolderByPath } from './services/workspace.service'
import { extractFolderArg } from './services/cli-launcher.service'
import { registerCliLauncherIpc } from './ipc/cli-launcher.ipc'
import { registerWorkspaceIpc } from './ipc/workspace.ipc'
import { registerWorktreeIpc } from './ipc/worktree.ipc'
import { reconcileWorktrees } from './services/workspace.service'
import { registerAgentIpc } from './ipc/agent.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerPresetsIpc } from './ipc/presets.ipc'
import { registerIntegrationsIpc } from './ipc/integrations.ipc'
import { registerWindowIpc, attachWindowMaximizeEvents } from './ipc/window.ipc'
import { registerLayoutIpc } from './ipc/layout.ipc'
import { registerGitIpc } from './ipc/git.ipc'
import { registerFsIpc } from './ipc/fs.ipc'
import { registerUpdateIpc } from './ipc/update.ipc'
import { daemonClient } from './services/daemonClient'

const isMac = process.platform === 'darwin'

// Display name for the macOS app menu, About panel, tray and notifications. Must
// be set before `ready`; otherwise dev runs inherit "Electron" from the bundle.
// On macOS the userData dir is case-insensitive, so this keeps the existing
// "superior" storage path. Packaged builds get the name from `build.productName`.
app.setName('Superior')

// Single instance: a second launch (e.g. `superior /some/dir`) must hand its
// folder to the already-running app instead of starting a rival process whose
// PTYs would fight over the daemon. The primary handles the hand-off below.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

/**
 * Register `dir` as a folder, make it active, and push the new state to the
 * renderer so an already-open window reflects it without a reload. Used by both
 * the cold-start CLI argument and the running-instance hand-off.
 */
function openFolderFromCli(dir: string): void {
  try {
    const state = addFolderByPath(dir)
    mainWindow?.webContents.send(IPC.WORKSPACE_STATE_CHANGED, state)
  } catch (err) {
    console.error('[cli] failed to open folder:', err)
  }
}

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

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
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
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

if (gotSingleInstanceLock) app.whenReady().then(async () => {
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
  registerIntegrationsIpc()
  registerWindowIpc()
  registerLayoutIpc()
  registerGitIpc()
  registerFsIpc()
  registerUpdateIpc()
  registerCliLauncherIpc()

  // Connect to (or launch) the terminal daemon so surviving sessions can be restored.
  daemonClient.ensure().catch((err) => console.error('[daemon] connect failed:', err))

  // Reconcile worktree-backed workspaces before the renderer reads state, so a
  // vanished worktree never leaves an agent launching in a stale cwd.
  await reconcileWorktrees()
    .then((warnings) => warnings.forEach((w) => console.warn('[worktree]', w)))
    .catch((err) => console.error('[worktree] reconcile failed:', err))

  // A folder passed on the command line (`superior /some/dir`). Persist it before
  // the window loads so the renderer's initial state read already includes it and
  // opens it active. Restrict cold-start parsing to the explicit `--path` flag in
  // development, where electron-vite passes the project dir as a bare argument.
  const startupDir = extractFolderArg(process.argv, process.cwd(), {
    requireFlag: !app.isPackaged
  })
  if (startupDir) {
    try {
      addFolderByPath(startupDir)
    } catch (err) {
      console.error('[cli] failed to open startup folder:', err)
    }
  }

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

// A second `superior <dir>` launch lands here in the primary process: open the
// folder and surface the window. `workingDirectory` is the calling shell's cwd,
// so a relative argument still resolves correctly.
app.on('second-instance', (_event, argv, workingDirectory) => {
  const dir = extractFolderArg(argv, workingDirectory || process.cwd())
  if (dir) openFolderFromCli(dir)
  focusMainWindow()
})

app.on('window-all-closed', () => {
  // PTYs live in the daemon and intentionally survive — do not kill them here.
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Detach from the daemon without killing sessions, so they persist.
  daemonClient.disconnect()
})
