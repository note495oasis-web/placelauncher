import { BrowserWindow } from 'electron'
import { friends, type WorldInfo, type PresenceStatus } from './client'
import { hostWorld, joinWorld, type HostHandle, type GuestHandle } from './tunnel'
import { getIdentity } from './identity'
import { exportModpack, importModpack } from '../instances/modpack'
import type { Instance } from '../instances/manager'

let activeHost: (HostHandle & { port: number }) | null = null
let activeGuest: GuestHandle | null = null
const worlds = new Map<string, WorldInfo>()
let eventsWired = false

function send(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, payload)
}

export function initFriendsEvents(): void {
  if (eventsWired) return
  eventsWired = true
  friends.on('connected', () => send('friends:connection', { connected: true }))
  friends.on('disconnected', () => send('friends:connection', { connected: false }))
  friends.on('friends', (msg) => send('friends:list', msg.friends))
  friends.on('presence', (msg) => send('friends:presence', msg))
  friends.on('world', (msg: WorldInfo) => {
    if (msg.hosting) worlds.set(msg.userId, msg)
    else worlds.delete(msg.userId)
    send('friends:world', msg)
  })
}

export function getWorlds(): WorldInfo[] {
  return [...worlds.values()]
}

export function getHostState(): { session: string; port: number } | null {
  return activeHost ? { session: activeHost.session, port: activeHost.port } : null
}

export function getGuestState(): { localPort: number } | null {
  return activeGuest ? { localPort: activeGuest.localPort } : null
}

export async function startHost(opts: { port: number; versionId?: string | null; instanceName?: string | null }): Promise<{ session: string; port: number }> {
  stopHost()
  const handle = await hostWorld(opts)
  activeHost = { ...handle, port: opts.port }
  send('friends:hosting', { session: handle.session, port: opts.port })
  return { session: handle.session, port: opts.port }
}

export function stopHost(): void {
  if (activeHost) {
    activeHost.stop()
    activeHost = null
    send('friends:hosting', null)
  }
}

export async function startJoin(session: string): Promise<{ localPort: number }> {
  stopJoin()
  const handle = await joinWorld(session)
  activeGuest = handle
  send('friends:joined', { localPort: handle.localPort })
  return { localPort: handle.localPort }
}

export function stopJoin(): void {
  if (activeGuest) {
    activeGuest.stop()
    activeGuest = null
    send('friends:joined', null)
  }
}

export function setStatus(status: PresenceStatus): void {
  friends.setStatus(status)
}

export function onGameLaunch(ctx: { versionId?: string; instanceName?: string }): void {
  if (!getIdentity()) return
  friends.setStatus({ status: 'in-game', versionId: ctx.versionId ?? null, instanceName: ctx.instanceName ?? null })
}

export function onGameLog(line: string, ctx: { versionId?: string; instanceName?: string }): void {
  if (!getIdentity() || activeHost) return
  const match = line.match(/Local game hosted on port (\d+)/)
  if (match) {
    const port = parseInt(match[1], 10)
    void startHost({ port, versionId: ctx.versionId ?? null, instanceName: ctx.instanceName ?? null }).catch(() => {
      // hosting is best-effort; game continues regardless
    })
  }
}

export function onGameStop(): void {
  stopHost()
  if (getIdentity()) friends.setStatus({ status: 'online' })
}

export async function shareInstance(instanceName: string): Promise<string> {
  const manifest = exportModpack(instanceName)
  return friends.uploadModpack(manifest)
}

export async function importShared(
  code: string,
  newName: string,
  onProgress?: (done: number, total: number) => void
): Promise<Instance> {
  const shared = await friends.fetchModpack(code)
  return importModpack(shared.manifest, newName, onProgress)
}

export function shutdownFriends(): void {
  stopHost()
  stopJoin()
  friends.disconnectPresence()
}