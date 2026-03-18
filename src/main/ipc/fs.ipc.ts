import { ipcMain } from 'electron'
import { IPC, type FsListResult } from '@shared/types'
import { listDir } from '../services/fs.service'

export function registerFsIpc(): void {
  ipcMain.handle(IPC.FS_LIST_DIR, (_event, dirPath: string): Promise<FsListResult> =>
    listDir(dirPath)
  )
}
