import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerWorkspaceIpc } from './ipc/workspace.ipc'
import { registerAgentIpc } from './ipc/agent.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { terminalService } from './services/terminal.service'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 480,
    show: false,
    backgroundColor: '#181825',
    title: 'Superior',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

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

app.whenReady().then(() => {
  registerWorkspaceIpc()
  registerAgentIpc()
  registerSettingsIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  terminalService.killAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  terminalService.killAll()
})
