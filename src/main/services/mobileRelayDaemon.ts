import * as net from 'net'
import { FrameDecoder, encodeFrame, type ServerMessage } from '@shared/daemon-protocol'
import { socketPath } from './daemonHost'
import { daemonClient } from './daemonClient'

export class MobileRelayDaemon {
  private socket: net.Socket | null = null
  private subscribed = new Set<string>()
  private pendingSnapshot = new Set<string>()

  constructor(private readonly emit: (message: ServerMessage) => void) {}

  isConnected(): boolean { return !!this.socket && !this.socket.destroyed }

  async connect(): Promise<void> {
    await daemonClient.ensure()
    const socket = net.connect(socketPath())
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    this.socket = socket
    const decoder = new FrameDecoder<ServerMessage>()
    socket.on('data', (chunk) => {
      if (typeof chunk === 'string') { socket.destroy(); return }
      try {
        for (const msg of decoder.push(chunk)) {
          if (msg.t === 'data' && this.subscribed.has(msg.id)) {
            if (msg.replay || this.pendingSnapshot.delete(msg.id)) {
              this.pendingSnapshot.delete(msg.id)
              this.emit({ ...msg, replay: true })
            } else this.emit(msg)
          } else if (msg.t === 'exit' && this.subscribed.has(msg.id)) {
            this.subscribed.delete(msg.id)
            this.pendingSnapshot.delete(msg.id)
            this.emit(msg)
          } else if (msg.t === 'error' && msg.id && this.subscribed.has(msg.id)) {
            this.subscribed.delete(msg.id)
            this.pendingSnapshot.delete(msg.id)
            this.emit(msg)
          }
        }
      } catch { socket.destroy() }
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null
      for (const id of this.subscribed) this.emit({ t: 'error', id, message: 'daemon_disconnected' })
      this.subscribed.clear()
      this.pendingSnapshot.clear()
    })
  }

  subscribe(id: string): void {
    if (!this.socket || this.socket.destroyed) throw new Error('daemon_disconnected')
    if (this.subscribed.has(id)) this.socket.write(encodeFrame({ t: 'detach', id }))
    else if (this.subscribed.size >= 12) throw new Error('too_many_subscriptions')
    this.subscribed.add(id)
    this.pendingSnapshot.add(id)
    this.socket.write(encodeFrame({ t: 'attach', id }))
  }

  unsubscribe(id: string): void {
    if (!this.subscribed.delete(id)) return
    this.pendingSnapshot.delete(id)
    this.socket?.write(encodeFrame({ t: 'detach', id }))
  }

  close(): void {
    this.socket?.destroy()
    this.socket = null
    this.subscribed.clear()
    this.pendingSnapshot.clear()
  }
}
