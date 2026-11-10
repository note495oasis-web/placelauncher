import { join } from 'path'
import { mkdirSync, readdirSync, existsSync, rmSync } from 'fs'
import { download } from '../net/http'

export type ContentDir = 'mods' | 'resourcepacks' | 'shaderpacks'

export async function installFile(
  instanceDir: string,
  file: { url: string; filename: string },
  subdir: ContentDir = 'mods',
  onProgress?: (received: number, total: number) => void
): Promise<string> {
  if (!file.url) throw new Error('У файла нет ссылки для скачивания (возможно, автор запретил распространение).')
  const dir = join(instanceDir, subdir)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, file.filename)
  await download(file.url, dest, onProgress)
  return dest
}

export function listContentFiles(instanceDir: string, subdir: ContentDir): string[] {
  const dir = join(instanceDir, subdir)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => !f.startsWith('.'))
}

export function removeContentFile(instanceDir: string, subdir: ContentDir, filename: string): void {
  const safe = filename.replace(/[<>:"/\\|?*]/g, '_')
  rmSync(join(instanceDir, subdir, safe), { force: true })
}