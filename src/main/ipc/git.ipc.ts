import { ipcMain } from 'electron'
import { IPC, type GitDiff, type GitStatus } from '@shared/types'
import { getGitDiff, getGitStatus, initGit } from '../services/git.service'

export function registerGitIpc(): void {
  ipcMain.handle(IPC.GIT_STATUS, (_event, folderPath: string): Promise<GitStatus> =>
    getGitStatus(folderPath)
  )

  ipcMain.handle(IPC.GIT_INIT, (_event, folderPath: string): Promise<GitStatus> =>
    initGit(folderPath)
  )

  ipcMain.handle(IPC.GIT_DIFF, (_event, folderPath: string): Promise<GitDiff> =>
    getGitDiff(folderPath)
  )
}
