import net from 'net'
import { randomUUID } from 'crypto'
import WebSocket from 'ws'
import { openBackendSocket } from './client'

const HIGH_WATER = 4 * 1024 * 1024

interface Channel {
  ws: WebSocket
  tcp: net.Socket
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data as ArrayBuffer)
}

function bridge(ws: WebSocket, tcp: net.Socket): void {
  const sock = ws as WebSocket & { _socket?: net.Socket }
  ws.on('message', (data) => {
    const buf = toBuffer(data)
    tcp.write(buf)
    if (tcp.writableLength > HIGH_WATER && sock._socket) sock._socket.pause()
  })
  tcp.on('data', (data) => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(data)
    if (ws.bufferedAmount > HIGH_WATER) tcp.pause()
  })
  tcp.on('drain', () => sock._socket && sock._socket.resume())
  if (sock._socket) sock._socket.on('drain', () => tcp.resume())
  const closeBoth = (): void => {
    tcp.destroy()
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }
  ws.on('close', closeBoth)
  ws.on('error', closeBoth)
  tcp.on('close', () => ws.close())
  tcp.on('error', closeBoth)
}

export interface HostHandle {
  session: string
  stop(): void
}

export interface HostOptions {
  port: number
  versionId?: string | null
  instanceName?: string | null
}

export async function hostWorld(opts: HostOptions): Promise<HostHandle> {
  const session = randomUUID()
  const control = await openBackendSocket('/tunnel/control')
  const channels = new Set<Channel>()
  let stopped = false

  await new Promise<void>((resolve, reject) => {
    control.once('open', () => resolve())
    control.once('error', reject)
  })

  control.on('message', (raw) => {
    let msg: { type?: string; channel?: string }
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.type === 'join' && typeof msg.channel === 'string' && !stopped) {
      const channel = msg.channel
      void (async () => {
        try {
          const ws = await openBackendSocket(
            `/tunnel/data?session=${encodeURIComponent(session)}&channel=${encodeURIComponent(channel)}&role=host`
          )
          const tcp = net.connect(opts.port, '127.0.0.1')
          const pair: Channel = { ws, tcp }
          channels.add(pair)
          bridge(ws, tcp)
          const remove = (): void => {
            channels.delete(pair)
          }
          ws.on('close', remove)
          tcp.on('close', remove)
        } catch {
          // channel failed; guest will time out
        }
      })()
    }
  })

  control.send(
    JSON.stringify({
      type: 'host',
      session,
      port: opts.port,
      versionId: opts.versionId ?? null,
      instanceName: opts.instanceName ?? null
    })
  )

  return {
    session,
    stop(): void {
      stopped = true
      if (control.readyState === WebSocket.OPEN) control.send(JSON.stringify({ type: 'stop' }))
      control.close()
      for (const c of channels) {
        c.tcp.destroy()
        c.ws.close()
      }
      channels.clear()
    }
  }
}

export interface GuestHandle {
  localPort: number
  stop(): void
}

export async function joinWorld(session: string): Promise<GuestHandle> {
  const channels = new Set<Channel>()
  const server = net.createServer((tcp) => {
    const channel = randomUUID()
    void (async () => {
      try {
        const ws = await openBackendSocket(
          `/tunnel/data?session=${encodeURIComponent(session)}&channel=${encodeURIComponent(channel)}&role=guest`
        )
        const pair: Channel = { ws, tcp }
        channels.add(pair)
        bridge(ws, tcp)
        const remove = (): void => {
          channels.delete(pair)
        }
        ws.on('close', remove)
        tcp.on('close', remove)
      } catch {
        tcp.destroy()
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  const localPort = typeof address === 'object' && address ? address.port : 0

  return {
    localPort,
    stop(): void {
      server.close()
      for (const c of channels) {
        c.tcp.destroy()
        c.ws.close()
      }
      channels.clear()
    }
  }
}