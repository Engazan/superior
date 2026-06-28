import { ipcMain, shell } from 'electron'
import {
  IPC,
  type FileReadOptions,
  type FileReadResult,
  type FileWriteResult,
  type FsListResult
} from '@shared/types'
import { listDir, readFilePreview, searchFiles, writeFilePreview } from '../services/fs.service'

export function registerFsIpc(): void {
  ipcMain.handle(IPC.FS_LIST_DIR, (_event, dirPath: string): Promise<FsListResult> =>
    listDir(dirPath)
  )

  ipcMain.handle(
    IPC.FS_SEARCH,
    (_event, rootPath: string, query: string): Promise<FsListResult> =>
      searchFiles(rootPath, query)
  )

  ipcMain.handle(
    IPC.FS_READ_FILE,
    (_event, filePath: string, opts: FileReadOptions): Promise<FileReadResult> =>
      readFilePreview(filePath, opts)
  )

  ipcMain.handle(
    IPC.FS_WRITE_FILE,
    (_event, filePath: string, content: string): Promise<FileWriteResult> =>
      writeFilePreview(filePath, content)
  )

  // Open a file with the OS default app (also covers "download"/save for PDFs
  // and other binaries we don't render in-app). Returns '' on success.
  ipcMain.handle(IPC.SHELL_OPEN_PATH, (_event, filePath: string): Promise<string> =>
    shell.openPath(filePath)
  )
}
