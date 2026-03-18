import { ipcMain } from 'electron'
import { IPC, type LayoutsState, type WorkspaceLayout } from '@shared/types'
import { getLayouts, setLayout } from '../services/layout.service'

export function registerLayoutIpc(): void {
  ipcMain.handle(IPC.LAYOUT_GET, (): LayoutsState => getLayouts())

  ipcMain.handle(
    IPC.LAYOUT_SET,
    (_event, args: { workspaceId: string; layout: WorkspaceLayout }): LayoutsState =>
      setLayout(args.workspaceId, args.layout)
  )
}
