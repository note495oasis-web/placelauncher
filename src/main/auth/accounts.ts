import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

export interface MicrosoftAccount {
  type: 'microsoft'
  id: string
  uuid: string
  username: string
  mcToken: string
  refreshToken: string
  expiresAt: number
}

export interface AuthlibAccount {
  type: 'authlib'
  id: string
  uuid: string
  username: string
  serverUrl: string
  accessToken: string
  clientToken: string
}

export interface OfflineAccount {
  type: 'offline'
  id: string
  uuid: string
  username: string
}

export type Account = MicrosoftAccount | AuthlibAccount | OfflineAccount

interface AccountStore {
  accounts: Account[]
  activeId: string | null
}

let cache: AccountStore | null = null

function filePath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'accounts.json')
}

function load(): AccountStore {
  if (cache) return cache
  try {
    if (existsSync(filePath())) {
      cache = JSON.parse(readFileSync(filePath(), 'utf8')) as AccountStore
      return cache
    }
  } catch {
    // corrupt file -> reset
  }
  cache = { accounts: [], activeId: null }
  return cache
}

function save(store: AccountStore): void {
  cache = store
  writeFileSync(filePath(), JSON.stringify(store, null, 2))
}

export function listAccounts(): Account[] {
  return load().accounts
}

export function getActive(): Account | null {
  const store = load()
  return store.accounts.find((a) => a.id === store.activeId) ?? null
}

export function setActive(id: string): void {
  const store = load()
  store.activeId = id
  save(store)
}

export function upsertAccount(acc: Account): Account {
  const store = load()
  const idx = store.accounts.findIndex((a) => a.id === acc.id)
  if (idx >= 0) store.accounts[idx] = acc
  else store.accounts.push(acc)
  if (!store.activeId) store.activeId = acc.id
  save(store)
  return acc
}

export function removeAccount(id: string): void {
  const store = load()
  store.accounts = store.accounts.filter((a) => a.id !== id)
  if (store.activeId === id) store.activeId = store.accounts[0]?.id ?? null
  save(store)
}

export function offlineUuid(name: string): string {
  const hash = createHash('md5').update('OfflinePlayer:' + name).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  const h = hash.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function addOffline(username: string): OfflineAccount {
  const uuid = offlineUuid(username)
  const acc: OfflineAccount = { type: 'offline', id: uuid, uuid, username }
  upsertAccount(acc)
  return acc
}