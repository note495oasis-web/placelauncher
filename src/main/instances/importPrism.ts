import { join } from 'path'
import { existsSync, readdirSync, readFileSync, cpSync, mkdirSync } from 'fs'
import { createInstance, instanceDir, type Instance, type InstanceLoader } from './manager'

export interface PrismInstanceInfo {
  path: string
  name: string
  versionId: string
  loader?: InstanceLoader
}

interface MmcComponent {
  uid: string
  version: string
}

export function defaultLauncherRoots(): string[] {
  const roots: string[] = []
  const appData = process.env.APPDATA
  const localAppData = process.env.LOCALAPPDATA
  const home = process.env.USERPROFILE ?? process.env.HOME
  if (appData) {
    roots.push(join(appData, 'PrismLauncher'), join(appData, 'MultiMC'), join(appData, '.minecraft'))
  }
  if (localAppData) {
    roots.push(join(localAppData, 'PrismLauncher'), join(localAppData, 'MultiMC'))
  }
  if (home) {
    roots.push(
      join(home, '.local', 'share', 'PrismLauncher'),
      join(home, '.local', 'share', 'MultiMC'),
      join(home, 'curseforge', 'minecraft', 'Instances'),
      join(home, 'Documents', 'CurseForge', 'Minecraft', 'Instances')
    )
  }
  return roots.filter((r) => existsSync(r))
}

function parseCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

function loaderFromComponents(components: MmcComponent[]): { versionId: string; loader?: InstanceLoader } {
  let versionId = ''
  let loader: InstanceLoader | undefined
  for (const c of components) {
    if (c.uid === 'net.minecraft') versionId = c.version
    else if (c.uid === 'net.fabricmc.fabric-loader') loader = { type: 'fabric', version: c.version }
    else if (c.uid === 'net.minecraftforge') loader = { type: 'forge', version: c.version }
    else if (c.uid === 'net.neoforged.neoforge') loader = { type: 'neoforge', version: c.version }
    else if (c.uid === 'org.quiltmc.quilt-loader') loader = { type: 'quilt', version: c.version }
  }
  return { versionId, loader }
}

export function scanPrismInstances(root: string): PrismInstanceInfo[] {
  const instancesRoot = existsSync(join(root, 'instances')) ? join(root, 'instances') : root
  if (!existsSync(instancesRoot)) return []
  const out: PrismInstanceInfo[] = []
  for (const entry of readdirSync(instancesRoot)) {
    const path = join(instancesRoot, entry)
    const packPath = join(path, 'mmc-pack.json')
    const cfgPath = join(path, 'instance.cfg')
    if (!existsSync(packPath) && !existsSync(cfgPath)) continue
    let versionId = ''
    let loader: InstanceLoader | undefined
    let name = entry
    if (existsSync(packPath)) {
      try {
        const pack = JSON.parse(readFileSync(packPath, 'utf8')) as { components?: MmcComponent[] }
        const parsed = loaderFromComponents(pack.components ?? [])
        versionId = parsed.versionId
        loader = parsed.loader
      } catch {
        // ignore
      }
    }
    if (existsSync(cfgPath)) {
      const cfg = parseCfg(readFileSync(cfgPath, 'utf8'))
      if (cfg.name) name = cfg.name
    }
    if (!versionId) continue
    out.push({ path, name, versionId, loader })
  }
  return out
}

export function scanAllLaunchers(): PrismInstanceInfo[] {
  const seen = new Set<string>()
  const out: PrismInstanceInfo[] = []
  for (const root of defaultLauncherRoots()) {
    for (const info of scanPrismInstances(root)) {
      if (seen.has(info.path)) continue
      seen.add(info.path)
      out.push(info)
    }
  }
  return out
}

function gameDataDir(prismInstancePath: string): string | null {
  for (const candidate of ['.minecraft', 'minecraft', '']) {
    const dir = candidate ? join(prismInstancePath, candidate) : prismInstancePath
    if (existsSync(join(dir, 'mods')) || existsSync(join(dir, 'options.txt')) || existsSync(join(dir, 'saves'))) {
      return dir
    }
  }
  return null
}

export function importPrismInstance(info: PrismInstanceInfo): Instance {
  const inst = createInstance({
    name: info.name,
    displayName: info.name,
    versionId: info.versionId,
    loader: info.loader,
    source: 'prism'
  })
  const src = gameDataDir(info.path)
  if (src) {
    const dest = instanceDir(inst.name)
    mkdirSync(dest, { recursive: true })
    const skip = new Set(['logs', 'crash-reports', 'webcache', 'Cache', 'GPUCache'])
    for (const entry of readdirSync(src)) {
      if (skip.has(entry)) continue
      try {
        cpSync(join(src, entry), join(dest, entry), { recursive: true })
      } catch {
        // skip files that fail to copy (locked, etc.)
      }
    }
  }
  return inst
}