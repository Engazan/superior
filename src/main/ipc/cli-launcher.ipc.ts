import { IPC, type ShellCommandInstallResult, type ShellCommandStatus } from '@shared/types'
import { installShellCommand, shellCommandStatus } from '../services/cli-launcher.service'
import { handle } from './handle'

export function registerCliLauncherIpc(): void {
  handle(IPC.SHELL_COMMAND_STATUS, (): Promise<ShellCommandStatus> => shellCommandStatus())
  handle(
    IPC.SHELL_COMMAND_INSTALL,
    (): Promise<ShellCommandInstallResult> => installShellCommand()
  )
}
