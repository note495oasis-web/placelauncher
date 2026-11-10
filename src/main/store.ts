import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

export interface ProxySettings {
  mode: 'off' | 'manual' | 'auto'
  type: 'socks5' | 'http'
  host: string
  port: number
  username?: string
  password?: string
}

export interface Settings {
  memoryMb: number
  javaPath: string
  gameDir: string
  proxy: ProxySettings
  curseforgeApiKey: string
  microsoftClientId: string
  backendUrl: string
  showAllVersions: boolean
}

const defaults: Settings = {
  memoryMb: 4096,
  javaPath: '',
  gameDir: '',
  proxy: { mode: 'off', type: 'socks5', host: '', port: 1080 },
  curseforgeApiKey: '',
  microsoftClientId: '',
  backendUrl: '',
  showAllVersions: false
}

let cachedPath = ''

function filePath(): string {
  if (!cachedPath) {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    cachedPath = join(dir, 'settings.json')
  }
  return cachedPath
}

export function getSettings(): Settings {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<Settings>
      return { ...defaults, ...raw, proxy: { ...defaults.proxy, ...(raw.proxy ?? {}) } }
    }
  } catch {
    // fall through to defaults on corrupt file
  }
  return { ...defaults, proxy: { ...defaults.proxy } }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const current = getSettings()
  const next: Settings = {
    ...current,
    ...patch,
    proxy: patch.proxy ? { ...current.proxy, ...patch.proxy } : current.proxy
  }
  writeFileSync(filePath(), JSON.stringify(next, null, 2))
  return next
}