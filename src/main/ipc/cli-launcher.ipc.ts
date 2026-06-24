import { ipcMain } from 'electron'
import { IPC, type ShellCommandInstallResult, type ShellCommandStatus } from '@shared/types'
import { installShellCommand, shellCommandStatus } from '../services/cli-launcher.service'

export function registerCliLauncherIpc(): void {
  ipcMain.handle(IPC.SHELL_COMMAND_STATUS, (): ShellCommandStatus => shellCommandStatus())
  ipcMain.handle(IPC.SHELL_COMMAND_INSTALL, (): ShellCommandInstallResult => installShellCommand())
}
