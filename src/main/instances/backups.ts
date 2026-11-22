import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'fs'
import { instanceDir } from './manager'

const SNAPSHOT_DIRS = ['mods', 'config', 'resourcepacks', 'shaderpacks']
const SNAPSHOT_FILES = ['options.txt', 'servers.dat']
const MAX_BACKUPS = 10

export interface BackupEntry {
  id: string
  ts: number
  label: string
  auto: boolean
}

interface BackupMeta extends BackupEntry {
  dirs: string[]
  files: string[]
}

function backupsDir(name: string): string {
  return join(instanceDir(name), 'backups')
}

function metaPath(dir: string): string {
  return join(dir, 'backup.json')
}

function readMeta(dir: string): BackupMeta | null {
  try {
    return JSON.parse(readFileSync(metaPath(dir), 'utf8')) as BackupMeta
  } catch {
    return null
  }
}

function listEntries(name: string): { meta: BackupMeta; dir: string }[] {
  const root = backupsDir(name)
  if (!existsSync(root)) return []
  const out: { meta: BackupMeta; dir: string }[] = []
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry)
    const meta = readMeta(dir)
    if (meta) out.push({ meta, dir })
  }
  return out.sort((a, b) => b.meta.ts - a.meta.ts)
}

function prune(name: string): void {
  const entries = listEntries(name)
  let autos = entries.filter((e) => e.meta.auto)
  let manual = entries.filter((e) => !e.meta.auto)
  while (autos.length + manual.length > MAX_BACKUPS) {
    const victim = autos.length ? autos.pop() : manual.pop()
    if (!victim) break
    rmSync(victim.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}

export function createBackup(name: string, label: string, auto = false): BackupEntry {
  const src = instanceDir(name)
  if (!existsSync(src)) throw new Error(`Сборка не найдена: ${name}`)
  const root = backupsDir(name)
  mkdirSync(root, { recursive: true })
  const ts = Date.now()
  const id = `${ts}${auto ? '-auto' : ''}`
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  const dirs: string[] = []
  for (const d of SNAPSHOT_DIRS) {
    const from = join(src, d)
    if (existsSync(from)) {
      cpSync(from, join(dir, d), { recursive: true })
      dirs.push(d)
    }
  }
  const files: string[] = []
  for (const f of SNAPSHOT_FILES) {
    const from = join(src, f)
    if (existsSync(from)) {
      cpSync(from, join(dir, f))
      files.push(f)
    }
  }
  const meta: BackupMeta = { id, ts, label, auto, dirs, files }
  writeFileSync(metaPath(dir), JSON.stringify(meta, null, 2))
  prune(name)
  return { id, ts, label, auto }
}

export function listBackups(name: string): BackupEntry[] {
  return listEntries(name).map((e) => ({ id: e.meta.id, ts: e.meta.ts, label: e.meta.label, auto: e.meta.auto }))
}

export function restoreBackup(name: string, id: string): void {
  const entry = listEntries(name).find((e) => e.meta.id === id)
  if (!entry) throw new Error('Бэкап не найден')
  const src = instanceDir(name)
  createBackup(name, 'перед восстановлением', true)
  for (const d of SNAPSHOT_DIRS) {
    const cur = join(src, d)
    const from = join(entry.dir, d)
    if (entry.meta.dirs.includes(d)) {
      rmSync(cur, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
      cpSync(from, cur, { recursive: true })
    } else if (existsSync(cur)) {
      rmSync(cur, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    }
  }
  for (const f of SNAPSHOT_FILES) {
    const cur = join(src, f)
    const from = join(entry.dir, f)
    if (entry.meta.files.includes(f)) {
      cpSync(from, cur)
    } else {
      rmSync(cur, { force: true })
    }
  }
}

export function deleteBackup(name: string, id: string): void {
  const entry = listEntries(name).find((e) => e.meta.id === id)
  if (!entry) throw new Error('Бэкап не найден')
  rmSync(entry.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
