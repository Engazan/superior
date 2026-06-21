import { ipcMain } from 'electron'
import { IPC, type UpdateInfo } from '@shared/types'
import {
  checkForUpdates,
  downloadUpdate,
  initAutoUpdater,
  openReleasePage,
  quitAndInstall
} from '../services/update.service'

export function registerUpdateIpc(): void {
  initAutoUpdater()

  ipcMain.handle(IPC.UPDATE_CHECK, (): Promise<UpdateInfo> => checkForUpdates())

  ipcMain.handle(IPC.UPDATE_OPEN, (_event, url: string): Promise<void> => openReleasePage(url))

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, (): Promise<void> => downloadUpdate())

  ipcMain.handle(IPC.UPDATE_INSTALL, (): void => quitAndInstall())
}
