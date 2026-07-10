import { ipcMain } from 'electron'

/**
 * Registers an invoke handler that does not use Electron's event object.
 *
 * Keeping the event out of regular handlers makes their payload signature
 * match the renderer contract while retaining ipcMain.handle's behavior.
 */
export function handle<Args extends unknown[], Result>(
  channel: string,
  listener: (...args: Args) => Result
): void {
  ipcMain.handle(channel, (_event, ...args: Args) => listener(...args))
}
