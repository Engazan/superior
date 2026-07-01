import { ipcMain } from 'electron'
import { IPC, type TabsState, type WorkspaceTabs } from '@shared/types'
import { getTabs, setTabs } from '../services/layout.service'

export function registerLayoutIpc(): void {
  ipcMain.handle(IPC.TABS_GET, (): TabsState => getTabs())

  ipcMain.handle(
    IPC.TABS_SET,
    (_event, args: { workspaceId: string; tabs: WorkspaceTabs }): TabsState =>
      setTabs(args.workspaceId, args.tabs)
  )
}
