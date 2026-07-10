import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult } from '@shared/ipc-contract'

/**
 * Registers an invoke handler that does not use Electron's event object.
 *
 * Keeping the event out of regular handlers makes their payload signature
 * match the renderer contract while retaining ipcMain.handle's behavior.
 */
export function handle<Channel extends IpcInvokeChannel>(
  channel: Channel,
  listener: (...args: IpcInvokeArgs<Channel>) =>
    | IpcInvokeResult<Channel>
    | Promise<IpcInvokeResult<Channel>>
): void {
  ipcMain.handle(channel, (_event, ...args: IpcInvokeArgs<Channel>) => listener(...args))
}

/** Registers an invoke handler that needs Electron's sender/event metadata. */
export function handleWithEvent<Channel extends IpcInvokeChannel>(
  channel: Channel,
  listener: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeArgs<Channel>
  ) => IpcInvokeResult<Channel> | Promise<IpcInvokeResult<Channel>>
): void {
  ipcMain.handle(channel, listener)
}
