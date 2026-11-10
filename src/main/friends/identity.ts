import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'

export interface FriendIdentity {
  userId: string
  username: string
  token: string
  friendCode: string
}

function filePath(): string {
  return join(app.getPath('userData'), 'friends.json')
}

export function getIdentity(): FriendIdentity | null {
  try {
    if (existsSync(filePath())) return JSON.parse(readFileSync(filePath(), 'utf8')) as FriendIdentity
  } catch {
    // ignore corrupt file
  }
  return null
}

export function saveIdentity(identity: FriendIdentity): void {
  writeFileSync(filePath(), JSON.stringify(identity, null, 2))
}

export function clearIdentity(): void {
  rmSync(filePath(), { force: true })
}