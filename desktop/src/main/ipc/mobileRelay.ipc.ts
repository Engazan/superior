import { IPC } from '@shared/types'
import { handle } from './handle'
import { mobileRelay } from '../services/mobileRelay.service'

export function registerMobileRelayIpc(): void {
  handle(IPC.MOBILE_RELAY_STATUS, () => mobileRelay.status())
  handle(IPC.MOBILE_RELAY_ENABLE, (enabled: boolean) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled flag.')
    return mobileRelay.setEnabled(enabled)
  })
  handle(IPC.MOBILE_RELAY_SET_URL, (url: string) => {
    if (typeof url !== 'string' || url.length > 2048) throw new Error('Invalid URL.')
    return mobileRelay.setUrl(url)
  })
  handle(IPC.MOBILE_RELAY_INVITE, () => mobileRelay.invite())
  handle(IPC.MOBILE_RELAY_REVOKE, (deviceId: string) => {
    if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) throw new Error('Invalid device ID.')
    return mobileRelay.revoke(deviceId)
  })
}
