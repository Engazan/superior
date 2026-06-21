import { ipcMain } from 'electron'
import { IPC, type UpdateInfo } from '@shared/types'
import { checkForUpdates, openReleasePage } from '../services/update.service'

export function registerUpdateIpc(): void {
  ipcMain.handle(IPC.UPDATE_CHECK, (): Promise<UpdateInfo> => checkForUpdates())

  ipcMain.handle(IPC.UPDATE_OPEN, (_event, url: string): Promise<void> => openReleasePage(url))
}
