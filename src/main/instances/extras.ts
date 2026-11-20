import { join, resolve, sep } from 'path'
import { existsSync, readdirSync, statSync, rmSync, writeFileSync } from 'fs'
import { nativeImage, shell } from 'electron'
import { instanceDir } from './manager'

export interface WorldEntry {
  name: string
  sizeMb: number
  modified: number
}

export interface ScreenshotEntry {
  name: string
  thumb: string
  ts: number
}

function dirSize(path: string): number {
  let total = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, entry.name)
    if (entry.isDirectory()) total += dirSize(p)
    else if (entry.isFile()) total += statSync(p).size
  }
  return total
}

export function listWorlds(name: string): WorldEntry[] {
  const dir = join(instanceDir(name), 'saves')
  if (!existsSync(dir)) return []
  const out: WorldEntry[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const p = join(dir, entry.name)
    const st = statSync(p)
    out.push({ name: entry.name, sizeMb: Math.round(dirSize(p) / 1048576), modified: st.mtimeMs })
  }
  return out.sort((a, b) => b.modified - a.modified)
}

export function listScreenshots(name: string): ScreenshotEntry[] {
  const dir = join(instanceDir(name), 'screenshots')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .map((f) => ({ f, ts: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 24)
  const out: ScreenshotEntry[] = []
  for (const { f, ts } of files) {
    const img = nativeImage.createFromPath(join(dir, f))
    if (img.isEmpty()) continue
    out.push({ name: f, thumb: img.resize({ width: 320 }).toDataURL(), ts })
  }
  return out
}

export function getCover(name: string): string | null {
  const p = join(instanceDir(name), 'cover.png')
  if (!existsSync(p)) return null
  const img = nativeImage.createFromPath(p)
  if (img.isEmpty()) return null
  return img.resize({ width: 900 }).toDataURL()
}

export function setCover(name: string, dataUrl: string | null): void {
  const p = join(instanceDir(name), 'cover.png')
  if (!dataUrl) {
    rmSync(p, { force: true })
    return
  }
  if (!dataUrl.startsWith('data:image/')) throw new Error('Неверный формат картинки')
  const img = nativeImage.createFromDataURL(dataUrl)
  if (img.isEmpty()) throw new Error('Не удалось прочитать картинку')
  writeFileSync(p, img.toPNG())
}

export function openInstanceFile(name: string, rel: string): Promise<string> {
  const base = resolve(instanceDir(name))
  const target = resolve(base, rel)
  if (target !== base && !target.startsWith(base + sep)) throw new Error('Неверный путь')
  return shell.openPath(target)
}