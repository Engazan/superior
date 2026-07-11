import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult } from '@shared/ipc-contract'
import { PersistenceError } from '../lib/jsonStore'

function ipcSafeError(err: unknown): Error {
  if (err instanceof PersistenceError) {
    return new Error(`${err.code}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error('Unexpected IPC failure.')
}

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
  ipcMain.handle(channel, async (_event, ...args: IpcInvokeArgs<Channel>) => {
    try {
      return await listener(...args)
    } catch (err) {
      throw ipcSafeError(err)
    }
  })
}

/** Registers an invoke handler that needs Electron's sender/event metadata. */
export function handleWithEvent<Channel extends IpcInvokeChannel>(
  channel: Channel,
  listener: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeArgs<Channel>
  ) => IpcInvokeResult<Channel> | Promise<IpcInvokeResult<Channel>>
): void {
  ipcMain.handle(channel, async (event, ...args: IpcInvokeArgs<Channel>) => {
    try {
      return await listener(event, ...args)
    } catch (err) {
      throw ipcSafeError(err)
    }
  })
}
