import { IPC, type TabsState, type WorkspaceTabs } from '@shared/types'
import { getTabs, setTabs } from '../services/layout.service'
import { handle } from './handle'

export function registerLayoutIpc(): void {
  handle(IPC.TABS_GET, (): TabsState => getTabs())

  handle(
    IPC.TABS_SET,
    (args: { workspaceId: string; tabs: WorkspaceTabs }): TabsState =>
      setTabs(args.workspaceId, args.tabs)
  )
}
