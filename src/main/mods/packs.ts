import { join, dirname, basename } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { download } from '../net/http'
import {
  createInstance,
  getInstance,
  deleteInstance,
  instanceDir,
  type Instance,
  type InstanceLoader
} from '../instances/manager'
import { recordInstall } from '../instances/modpack'
import { getCurseforgeFile } from './curseforge'
import type { ContentDir } from './install'

export interface PackInstallResult {
  instance: Instance
  skipped: number
}

export type PackProgress = (done: number, total: number) => void

function safeJoin(dir: string, rel: string): string {
  const norm = rel.replace(/\\/g, '/')
  if (norm.startsWith('/') || norm.split('/').includes('..')) {
    throw new Error(`Небезопасный путь в архиве: ${rel}`)
  }
  return join(dir, norm)
}

function uniqueName(title: string): string {
  const base = title.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Modpack'
  let name = base
  for (let i = 2; getInstance(name); i++) name = `${base} (${i})`
  return name
}

function subdirOf(path: string): ContentDir | null {
  const norm = path.replace(/\\/g, '/')
  if (norm.startsWith('mods/')) return 'mods'
  if (norm.startsWith('resourcepacks/')) return 'resourcepacks'
  if (norm.startsWith('shaderpacks/')) return 'shaderpacks'
  return null
}

function extractOverrides(zip: AdmZip, dir: string, folder: string): void {
  const pref = `${folder}/`
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !e.entryName.startsWith(pref)) continue
    const rel = e.entryName.slice(pref.length)
    if (!rel) continue
    const dest = safeJoin(dir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, e.getData())
  }
}

interface MrpackIndex {
  name?: string
  files?: { path: string; downloads?: string[]; fileSize?: number; env?: { client?: string; server?: string } }[]
  dependencies?: Record<string, string>
}

const LOADER_KEYS: [string, InstanceLoader['type']][] = [
  ['fabric-loader', 'fabric'],
  ['quilt-loader', 'quilt'],
  ['neoforge', 'neoforge'],
  ['forge', 'forge']
]

export async function installModrinthPack(
  url: string,
  title: string,
  onProgress?: PackProgress
): Promise<PackInstallResult> {
  const tmp = join(tmpdir(), `placelauncher-pack-${Date.now()}.mrpack`)
  await download(url, tmp)
  let inst: Instance | null = null
  try {
    const zip = new AdmZip(tmp)
    const entry = zip.getEntry('modrinth.index.json')
    if (!entry) throw new Error('Это не модпак Modrinth: в архиве нет modrinth.index.json')
    const idx = JSON.parse(entry.getData().toString('utf8')) as MrpackIndex
    const versionId = idx.dependencies?.minecraft
    if (!versionId) throw new Error('В модпаке не указана версия Minecraft')
    let loader: InstanceLoader | undefined
    for (const [key, type] of LOADER_KEYS) {
      const v = idx.dependencies?.[key]
      if (v) {
        loader = { type, version: v }
        break
      }
    }
    inst = createInstance({
      name: uniqueName(idx.name || title),
      displayName: idx.name || title,
      versionId,
      loader,
      source: 'modrinth-pack'
    })
    const dir = instanceDir(inst.name)
    const all = idx.files ?? []
    const total = all.filter((f) => f.downloads?.length && f.env?.client !== 'unsupported').length
    let done = 0
    let skipped = 0
    for (const f of all) {
      if (!f.downloads?.length || f.env?.client === 'unsupported') {
        skipped++
        continue
      }
      const dest = safeJoin(dir, f.path)
      mkdirSync(dirname(dest), { recursive: true })
      await download(f.downloads[0], dest)
      const sub = subdirOf(f.path)
      if (sub) {
        recordInstall(inst.name, {
          source: 'modrinth',
          filename: basename(f.path),
          url: f.downloads[0],
          subdir: sub,
          size: f.fileSize
        })
      }
      onProgress?.(++done, total)
    }
    extractOverrides(zip, dir, 'overrides')
    extractOverrides(zip, dir, 'client-overrides')
    return { instance: inst, skipped }
  } catch (e) {
    if (inst) deleteInstance(inst.name)
    throw e
  } finally {
    rmSync(tmp, { force: true })
  }
}

interface CfManifest {
  name?: string
  minecraft?: { version?: string; modLoaders?: { id: string; primary?: boolean }[] }
  overrides?: string
  files?: { projectID: number; fileID: number; required?: boolean }[]
}

async function fillCurseforgePack(
  dir: string,
  zip: AdmZip,
  man: CfManifest,
  instanceName: string,
  onProgress?: PackProgress
): Promise<{ downloaded: number; skipped: number }> {
  mkdirSync(join(dir, 'mods'), { recursive: true })
  const files = man.files ?? []
  let done = 0
  let skipped = 0
  let downloaded = 0
  for (const f of files) {
    let cf: { url: string; filename: string; size: number } | null = null
    try {
      cf = await getCurseforgeFile(String(f.projectID), String(f.fileID))
    } catch {
      cf = null
    }
    if (!cf?.url) {
      skipped++
      onProgress?.(++done, files.length)
      continue
    }
    await download(cf.url, join(dir, 'mods', cf.filename))
    recordInstall(instanceName, {
      source: 'curseforge',
      projectId: String(f.projectID),
      filename: cf.filename,
      url: cf.url,
      subdir: 'mods',
      size: cf.size
    })
    downloaded++
    onProgress?.(++done, files.length)
  }
  extractOverrides(zip, dir, man.overrides ?? 'overrides')
  return { downloaded, skipped }
}

export async function installCurseforgePack(
  url: string,
  title: string,
  onProgress?: PackProgress
): Promise<PackInstallResult> {
  const tmp = join(tmpdir(), `placelauncher-pack-${Date.now()}.zip`)
  await download(url, tmp)
  let inst: Instance | null = null
  try {
    const zip = new AdmZip(tmp)
    const entry = zip.getEntry('manifest.json')
    if (!entry) throw new Error('Это не модпак CurseForge: в архиве нет manifest.json')
    const man = JSON.parse(entry.getData().toString('utf8')) as CfManifest
    const versionId = man.minecraft?.version
    if (!versionId) throw new Error('В модпаке не указана версия Minecraft')
    const loaderId =
      man.minecraft?.modLoaders?.find((m) => m.primary)?.id ?? man.minecraft?.modLoaders?.[0]?.id
    let loader: InstanceLoader | undefined
    if (loaderId) {
      const m = /^(fabric|quilt|forge|neoforge)-(.+)$/.exec(loaderId)
      if (!m) throw new Error(`Неподдерживаемый загрузчик модпака: ${loaderId}`)
      loader = { type: m[1] as InstanceLoader['type'], version: m[2] }
    }
    inst = createInstance({
      name: uniqueName(man.name || title),
      displayName: man.name || title,
      versionId,
      loader,
      source: 'curseforge-pack'
    })
    const { skipped } = await fillCurseforgePack(instanceDir(inst.name), zip, man, inst.name, onProgress)
    return { instance: inst, skipped }
  } catch (e) {
    if (inst) deleteInstance(inst.name)
    throw e
  } finally {
    rmSync(tmp, { force: true })
  }
}

export async function fetchCurseforgePackMods(
  packId: string,
  fileId: string,
  instanceName: string,
  onProgress?: PackProgress
): Promise<{ downloaded: number; skipped: number }> {
  const cf = await getCurseforgeFile(packId, fileId)
  if (!cf.url) return { downloaded: 0, skipped: 0 }
  const tmp = join(tmpdir(), `placelauncher-import-${Date.now()}.zip`)
  await download(cf.url, tmp)
  try {
    const zip = new AdmZip(tmp)
    const entry = zip.getEntry('manifest.json')
    if (!entry) return { downloaded: 0, skipped: 0 }
    const man = JSON.parse(entry.getData().toString('utf8')) as CfManifest
    return await fillCurseforgePack(instanceDir(instanceName), zip, man, instanceName, onProgress)
  } finally {
    rmSync(tmp, { force: true })
  }
}