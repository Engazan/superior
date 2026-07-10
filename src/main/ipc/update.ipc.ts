import { IPC, type UpdateInfo } from '@shared/types'
import {
  checkForUpdates,
  downloadUpdate,
  initAutoUpdater,
  openReleasePage,
  quitAndInstall
} from '../services/update.service'
import { handle } from './handle'

export function registerUpdateIpc(): void {
  initAutoUpdater()

  handle(IPC.UPDATE_CHECK, (): Promise<UpdateInfo> => checkForUpdates())

  handle(IPC.UPDATE_OPEN, (url: string): Promise<void> => openReleasePage(url))

  handle(IPC.UPDATE_DOWNLOAD, (): Promise<void> => downloadUpdate())

  handle(IPC.UPDATE_INSTALL, (): void => quitAndInstall())
}
