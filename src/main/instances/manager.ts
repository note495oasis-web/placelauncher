import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { gameDir } from '../game/paths'

export interface InstanceLoader {
  type: 'fabric' | 'forge' | 'neoforge' | 'quilt'
  version: string
}

export interface Instance {
  name: string
  displayName: string
  versionId: string
  loader?: InstanceLoader
  memoryMb?: number
  createdAt: number
  lastPlayed?: number
  source?: string
}

export function instancesDir(): string {
  return join(gameDir(), 'instances')
}

export function instanceDir(name: string): string {
  return join(instancesDir(), name)
}

function metaPath(name: string): string {
  return join(instanceDir(name), 'instance.json')
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'instance'
}

export function listInstances(): Instance[] {
  const dir = instancesDir()
  if (!existsSync(dir)) return []
  const out: Instance[] = []
  for (const entry of readdirSync(dir)) {
    const mp = join(dir, entry, 'instance.json')
    if (!existsSync(mp)) continue
    try {
      out.push(JSON.parse(readFileSync(mp, 'utf8')) as Instance)
    } catch {
      // skip corrupt
    }
  }
  return out.sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
}

export function getInstance(name: string): Instance | null {
  const mp = metaPath(name)
  if (!existsSync(mp)) return null
  try {
    return JSON.parse(readFileSync(mp, 'utf8')) as Instance
  } catch {
    return null
  }
}

export function createInstance(opts: {
  name: string
  displayName?: string
  versionId: string
  loader?: InstanceLoader
  source?: string
}): Instance {
  const name = sanitize(opts.name)
  mkdirSync(instanceDir(name), { recursive: true })
  const inst: Instance = {
    name,
    displayName: opts.displayName ?? opts.name,
    versionId: opts.versionId,
    loader: opts.loader,
    createdAt: Date.now(),
    source: opts.source ?? 'created'
  }
  writeFileSync(metaPath(name), JSON.stringify(inst, null, 2))
  return inst
}

export function updateInstance(name: string, patch: Partial<Instance>): Instance | null {
  const inst = getInstance(name)
  if (!inst) return null
  const next = { ...inst, ...patch, name }
  writeFileSync(metaPath(name), JSON.stringify(next, null, 2))
  return next
}

export function deleteInstance(name: string): void {
  rmSync(instanceDir(name), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

export function touchPlayed(name: string): void {
  updateInstance(name, { lastPlayed: Date.now() })
}