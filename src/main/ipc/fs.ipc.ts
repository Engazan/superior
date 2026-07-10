import { shell } from 'electron'
import {
  IPC,
  type FileLinkTarget,
  type FileReadOptions,
  type FileReadResult,
  type FileWriteResult,
  type FsListResult
} from '@shared/types'
import {
  listDir,
  readFilePreview,
  resolveFileLink,
  searchFiles,
  writeFilePreview
} from '../services/fs.service'
import { isWithinWorkspaceFolder } from '../services/workspace.service'
import { openFileTarget } from '../services/file-opener.service'
import { handle } from './handle'

export function registerFsIpc(): void {
  handle(IPC.FS_LIST_DIR, (dirPath: string): Promise<FsListResult> =>
    listDir(dirPath)
  )

  handle(
    IPC.FS_SEARCH,
    (rootPath: string, query: string): Promise<FsListResult> =>
      searchFiles(rootPath, query)
  )

  handle(
    IPC.FS_READ_FILE,
    (filePath: string, opts: FileReadOptions): Promise<FileReadResult> =>
      readFilePreview(filePath, opts)
  )

  handle(
    IPC.FS_WRITE_FILE,
    (filePath: string, content: string): Promise<FileWriteResult> =>
      writeFilePreview(filePath, content)
  )

  // Open a file with the OS default app (also covers "download"/save for PDFs
  // and other binaries we don't render in-app). Returns '' on success. Gated by
  // the same containment rule as every other fs entry point — the renderer
  // shows untrusted repo content and must not launch arbitrary disk paths.
  handle(IPC.SHELL_OPEN_PATH, (filePath: string): Promise<string> =>
    isWithinWorkspaceFolder(filePath)
      ? shell.openPath(filePath)
      : Promise.resolve('Path is outside the opened workspace folders.')
  )

  // Terminal file links: validate a path-like token against the workspace
  // (hover), and open a resolved target in the configured editor (click).
  handle(
    IPC.FS_RESOLVE_FILE_LINK,
    (cwd: string | null, token: string): Promise<FileLinkTarget | null> =>
      resolveFileLink(cwd, token)
  )

  handle(
    IPC.FS_OPEN_FILE_TARGET,
    (target: FileLinkTarget): Promise<{ ok: boolean; error?: string }> =>
      openFileTarget(target)
  )
}
