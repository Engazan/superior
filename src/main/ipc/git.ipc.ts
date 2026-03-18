import { ipcMain } from 'electron'
import { IPC, type GitStatus } from '@shared/types'
import { getGitStatus, initGit } from '../services/git.service'

export function registerGitIpc(): void {
  ipcMain.handle(IPC.GIT_STATUS, (_event, folderPath: string): Promise<GitStatus> =>
    getGitStatus(folderPath)
  )

  ipcMain.handle(IPC.GIT_INIT, (_event, folderPath: string): Promise<GitStatus> =>
    initGit(folderPath)
  )
}
