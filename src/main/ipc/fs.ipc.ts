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
import {
  boundedString,
  isFileLinkTarget,
  isFileReadOptions
} from './validation'

export function registerFsIpc(): void {
  handle(IPC.FS_LIST_DIR, (dirPath: string): Promise<FsListResult> =>
    boundedString(dirPath) ? listDir(dirPath) : Promise.resolve({ entries: [], error: 'Invalid path.' })
  )

  handle(
    IPC.FS_SEARCH,
    (rootPath: string, query: string): Promise<FsListResult> =>
      boundedString(rootPath) && boundedString(query, 10_000)
        ? searchFiles(rootPath, query)
        : Promise.resolve({ entries: [], error: 'Invalid search request.' })
  )

  handle(
    IPC.FS_READ_FILE,
    (filePath: string, opts: FileReadOptions): Promise<FileReadResult> =>
      boundedString(filePath) && isFileReadOptions(opts)
        ? readFilePreview(filePath, opts)
        : Promise.resolve({
            size: 0,
            truncated: false,
            encoding: 'none',
            content: '',
            isBinary: false,
            error: 'Invalid file request.'
          })
  )

  handle(
    IPC.FS_WRITE_FILE,
    (filePath: string, content: string): Promise<FileWriteResult> =>
      boundedString(filePath) && boundedString(content, 20 * 1024 * 1024)
        ? writeFilePreview(filePath, content)
        : Promise.resolve({ ok: false, error: 'Invalid file write request.' })
  )

  // Open a file with the OS default app (also covers "download"/save for PDFs
  // and other binaries we don't render in-app). Returns '' on success. Gated by
  // the same containment rule as every other fs entry point — the renderer
  // shows untrusted repo content and must not launch arbitrary disk paths.
  handle(IPC.SHELL_OPEN_PATH, (filePath: string): Promise<string> =>
    boundedString(filePath) && isWithinWorkspaceFolder(filePath)
      ? shell.openPath(filePath)
      : Promise.resolve('Path is outside the opened workspace folders.')
  )

  // Terminal file links: validate a path-like token against the workspace
  // (hover), and open a resolved target in the configured editor (click).
  handle(
    IPC.FS_RESOLVE_FILE_LINK,
    (cwd: string | null, token: string): Promise<FileLinkTarget | null> =>
      (cwd === null || boundedString(cwd)) && boundedString(token, 10_000)
        ? resolveFileLink(cwd, token)
        : Promise.resolve(null)
  )

  handle(
    IPC.FS_OPEN_FILE_TARGET,
    (target: FileLinkTarget): Promise<{ ok: boolean; error?: string }> =>
      isFileLinkTarget(target)
        ? openFileTarget(target)
        : Promise.resolve({ ok: false, error: 'Invalid file target.' })
  )
}
