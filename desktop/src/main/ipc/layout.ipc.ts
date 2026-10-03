import { IPC, type TabsState, type WorkspaceTabs } from '@shared/types'
import { getTabs, setTabs } from '../services/layout.service'
import { handle } from './handle'
import { invalidPayload, isRecord, isWorkspaceTabs, validId } from './validation'

export function registerLayoutIpc(): void {
  handle(IPC.TABS_GET, (): TabsState => getTabs())

  handle(
    IPC.TABS_SET,
    (args: { workspaceId: string; tabs: WorkspaceTabs }): TabsState =>
      isRecord(args) && validId(args.workspaceId) && isWorkspaceTabs(args.tabs)
        ? setTabs(args.workspaceId, args.tabs)
        : invalidPayload()
  )
}
