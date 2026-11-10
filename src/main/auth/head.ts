import { app, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { apiRequest, apiJson } from '../net/http'
import { listAccounts, type AuthlibAccount } from './accounts'

const cache = new Map<string, string>()
const TTL = 12 * 3600 * 1000

async function authlibSkinUrl(acc: AuthlibAccount): Promise<string | null> {
  const root = await apiRequest(acc.serverUrl, { timeout: 8000 })
  const loc = root.headers['x-authlib-injector-api-location']
  const base = loc ? new URL(String(loc), acc.serverUrl).toString().replace(/\/+$/, '') : acc.serverUrl
  const profile = await apiJson<{ properties?: { name: string; value: string }[] }>(
    `${base}/sessionserver/session/minecraft/profile/${acc.uuid}`,
    { timeout: 8000 }
  )
  const tex = profile.properties?.find((p) => p.name === 'textures')
  if (!tex) return null
  const decoded = JSON.parse(Buffer.from(tex.value, 'base64').toString('utf8')) as {
    textures?: { SKIN?: { url?: string } }
  }
  return decoded.textures?.SKIN?.url ?? null
}

function headFromSkin(skin: Buffer): string | null {
  const img = nativeImage.createFromBuffer(skin)
  const size = img.getSize()
  if (size.width < 64 || size.height < 32) return null
  const bmp = img.toBitmap()
  const px = (x: number, y: number): number[] => {
    const i = (y * size.width + x) * 4
    return [bmp[i], bmp[i + 1], bmp[i + 2], bmp[i + 3]]
  }
  const out = Buffer.alloc(8 * 8 * 4)
  const hasOverlay = size.height >= 64
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const b = px(8 + x, 8 + y)
      const o = hasOverlay ? px(40 + x, 8 + y) : [0, 0, 0, 0]
      const a = o[3] / 255
      const i = (y * 8 + x) * 4
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(o[c] * a + b[c] * (1 - a))
      out[i + 3] = 255
    }
  }
  return nativeImage.createFromBitmap(out, { width: 8, height: 8 }).toDataURL()
}

export async function getAccountHead(id: string): Promise<string | null> {
  const acc = listAccounts().find((a) => a.id === id)
  if (!acc) return null
  const cached = cache.get(id)
  if (cached) return cached

  const dir = join(app.getPath('userData'), 'heads')
  mkdirSync(dir, { recursive: true })
  const suffix = acc.type === 'authlib' ? '-authlib' : ''
  const file = join(dir, `${acc.uuid.replace(/[^a-zA-Z0-9-]/g, '')}${suffix}.png`)
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < TTL) {
    const data = `data:image/png;base64,${readFileSync(file).toString('base64')}`
    cache.set(id, data)
    return data
  }

  try {
    let data: string | null = null
    if (acc.type === 'authlib') {
      const url = await authlibSkinUrl(acc)
      if (url) {
        const res = await apiRequest(url, { timeout: 8000, headers: { Accept: 'image/png' } })
        if (res.status === 200 && res.body.length) data = headFromSkin(res.body)
      }
    } else {
      const identifier = acc.type === 'offline' ? acc.username : acc.uuid.replace(/-/g, '')
      const res = await apiRequest(`https://mc-heads.net/avatar/${encodeURIComponent(identifier)}/64`, {
        timeout: 8000,
        headers: { Accept: 'image/png' }
      })
      if (res.status === 200 && res.body.length) data = `data:image/png;base64,${res.body.toString('base64')}`
    }
    if (!data) return null
    writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
    cache.set(id, data)
    return data
  } catch {
    return null
  }
}