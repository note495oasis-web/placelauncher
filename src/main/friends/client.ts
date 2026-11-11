import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { getSettings } from '../store'
import { apiRequest } from '../net/http'
import { resolveAgent } from '../net/proxy'
import type { ModpackManifest } from '../instances/modpack'
import type { InstanceLoader } from '../instances/manager'
import { getIdentity, saveIdentity, clearIdentity, type FriendIdentity } from './identity'

export interface FriendInfo {
  userId: string
  username: string
  friendCode: string
  online: boolean
  status: string
  versionId: string | null
  instanceName: string | null
  loader: InstanceLoader | null
}

export interface WorldInfo {
  userId: string
  username: string
  session: string
  hosting: boolean
  port: number | null
  versionId: string | null
  instanceName: string | null
}

export interface SharedModpack {
  manifest: ModpackManifest
  ownerUsername: string
  createdAt: number
}

export interface PresenceStatus {
  status: 'online' | 'in-game' | 'away'
  versionId?: string | null
  instanceName?: string | null
  loader?: InstanceLoader | null
}

function backendBase(): string {
  const raw = getSettings().backendUrl.trim().replace(/\/+$/, '')
  if (!raw) throw new Error('Укажите адрес сервера друзей в настройках.')
  if (!/^https?:\/\//.test(raw)) throw new Error('Адрес сервера должен начинаться с http:// или https://.')
  return raw
}

function wsBase(): string {
  return backendBase().replace(/^http/, 'ws')
}

export async function openBackendSocket(path: string): Promise<WebSocket> {
  const token = getIdentity()?.token
  if (!token) throw new Error('Сначала создайте профиль друзей.')
  const sep = path.includes('?') ? '&' : '?'
  const url = `${wsBase()}${path}${sep}token=${encodeURIComponent(token)}`
  const agent = await resolveAgent(url.replace(/^ws/, 'http'))
  return new WebSocket(url, agent ? { agent } : {})
}

async function backendRequest<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getIdentity()?.token
    if (!token) throw new Error('Сначала создайте профиль друзей.')
    headers.Authorization = `Bearer ${token}`
  }
  const res = await apiRequest(backendBase() + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = res.body.toString('utf8')
  let json: Record<string, unknown> | null = null
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    // non-JSON error body
  }
  if (res.status < 200 || res.status >= 300) {
    if (auth && res.status === 401) {
      friends.logout()
      friends.emit('session-expired')
      throw new Error('Сессия друзей устарела (сервер перезапустился). Создайте профиль заново.')
    }
    const message = json && typeof json.error === 'string' ? json.error : `Ошибка сервера (HTTP ${res.status}).`
    throw new Error(message)
  }
  return json as T
}

class FriendsService extends EventEmitter {
  private ws: WebSocket | null = null
  private intentionalClose = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private currentStatus: PresenceStatus = { status: 'online' }

  getIdentity(): FriendIdentity | null {
    return getIdentity()
  }

  logout(): void {
    this.disconnectPresence()
    clearIdentity()
  }

  async register(username: string): Promise<FriendIdentity> {
    const data = await backendRequest<FriendIdentity>('POST', '/api/register', { username }, false)
    saveIdentity(data)
    return data
  }

  me(): Promise<{ userId: string; username: string; friendCode: string; friends: number }> {
    return backendRequest('GET', '/api/me')
  }

  listFriends(): Promise<FriendInfo[]> {
    return backendRequest<FriendInfo[]>('GET', '/api/friends')
  }

  addFriend(friendCode: string): Promise<FriendInfo[]> {
    return backendRequest<FriendInfo[]>('POST', '/api/friends', { friendCode })
  }

  removeFriend(userId: string): Promise<FriendInfo[]> {
    return backendRequest<FriendInfo[]>('DELETE', `/api/friends/${userId}`)
  }

  async uploadModpack(manifest: ModpackManifest): Promise<string> {
    const res = await backendRequest<{ code: string }>('POST', '/api/modpacks', { manifest })
    return res.code
  }

  fetchModpack(code: string): Promise<SharedModpack> {
    return backendRequest<SharedModpack>('GET', `/api/modpacks/${encodeURIComponent(code)}`)
  }

  connectPresence(): void {
    if (this.ws || this.reconnectTimer) return
    this.intentionalClose = false
    void this.openPresence()
  }

  disconnectPresence(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  setStatus(status: PresenceStatus): void {
    this.currentStatus = status
    this.pushStatus()
  }

  private pushStatus(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'status', ...this.currentStatus }))
    }
  }

  private async openPresence(): Promise<void> {
    try {
      const ws = await openBackendSocket('/ws')
      this.ws = ws
      ws.on('open', () => {
        this.emit('connected')
        this.pushStatus()
      })
      ws.on('message', (raw) => {
        let msg: { type?: string } & Record<string, unknown>
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (msg.type === 'friends' || msg.type === 'presence' || msg.type === 'world') {
          this.emit(msg.type, msg)
        }
      })
      ws.on('close', () => {
        this.ws = null
        this.emit('disconnected')
        if (!this.intentionalClose) this.scheduleReconnect()
      })
      ws.on('error', () => {
        // 'close' fires afterwards and handles reconnect
      })
    } catch {
      if (!this.intentionalClose) this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionalClose) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openPresence()
    }, 5000)
  }
}

export const friends = new FriendsService()