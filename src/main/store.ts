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

export interface ThemeSettings {
  preset: 'standard' | 'purple' | 'custom'
  customStart: string
  customEnd: string
  angle: number
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
  theme: ThemeSettings
}

const defaults: Settings = {
  memoryMb: 4096,
  javaPath: '',
  gameDir: '',
  proxy: { mode: 'off', type: 'socks5', host: '', port: 1080 },
  curseforgeApiKey: '',
  microsoftClientId: '',
  backendUrl: '',
  showAllVersions: false,
  theme: { preset: 'standard', customStart: '#8a2be2', customEnd: '#000000', angle: 135 }
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
      return {
        ...defaults,
        ...raw,
        proxy: { ...defaults.proxy, ...(raw.proxy ?? {}) },
        theme: { ...defaults.theme, ...(raw.theme ?? {}) }
      }
    }
  } catch {
    // fall through to defaults on corrupt file
  }
  return { ...defaults, proxy: { ...defaults.proxy }, theme: { ...defaults.theme } }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const current = getSettings()
  const next: Settings = {
    ...current,
    ...patch,
    proxy: patch.proxy ? { ...current.proxy, ...patch.proxy } : current.proxy,
    theme: patch.theme ? { ...current.theme, ...patch.theme } : current.theme
  }
  writeFileSync(filePath(), JSON.stringify(next, null, 2))
  return next
}