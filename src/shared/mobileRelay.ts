export interface MobileRelayStatus {
  enabled: boolean
  connected: boolean
  url: string
  hostId: string
  error?: string
  devices: { id: string; createdAt: number; paired: boolean }[]
}

export interface MobileRelayInvite {
  deviceId: string
  expiresAt: number
  /** Contains a secret: only show locally on the owner's screen. */
  pairing: string
}
