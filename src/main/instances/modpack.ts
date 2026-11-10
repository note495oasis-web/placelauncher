import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import AdmZip from 'adm-zip'
import { download } from '../net/http'
import { installFile, type ContentDir } from '../mods/install'
import { createInstance, getInstance, instanceDir, type Instance, type InstanceLoader } from './manager'

export interface TrackedFile {
  source: 'modrinth' | 'curseforge' | 'url'
  projectId?: string
  filename: string
  url: string
  subdir: ContentDir
  size?: number
}

export interface ModpackManifest {
  format: 1
  name: string
  versionId: string
  loader?: InstanceLoader
  files: TrackedFile[]
  configZip?: string
  createdAt: number
}

const CONFIG_ZIP_LIMIT = 3 * 1024 * 1024

function trackedPath(name: string): string {
  return join(instanceDir(name), 'tracked-mods.json')
}

function readTracked(name: string): TrackedFile[] {
  try {
    if (existsSync(trackedPath(name))) return JSON.parse(readFileSync(trackedPath(name), 'utf8')) as TrackedFile[]
  } catch {
    // ignore
  }
  return []
}

function writeTracked(name: string, files: TrackedFile[]): void {
  writeFileSync(trackedPath(name), JSON.stringify(files, null, 2))
}

export function listTracked(name: string): TrackedFile[] {
  return readTracked(name)
}

export function unrecordInstall(name: string, filename: string, subdir: ContentDir): void {
  writeTracked(name, readTracked(name).filter((f) => !(f.filename === filename && f.subdir === subdir)))
}

export function recordInstall(name: string, entry: TrackedFile): void {
  const files = readTracked(name).filter((f) => !(f.filename === entry.filename && f.subdir === entry.subdir))
  files.push(entry)
  writeTracked(name, files)
}

export async function installTrackedMod(
  name: string,
  source: TrackedFile['source'],
  projectId: string | undefined,
  file: { url: string; filename: string; size?: number },
  subdir: ContentDir = 'mods'
): Promise<string> {
  const dest = await installFile(instanceDir(name), file, subdir)
  recordInstall(name, { source, projectId, filename: file.filename, url: file.url, subdir, size: file.size })
  return dest
}

export function exportModpack(name: string): ModpackManifest {
  const inst = getInstance(name)
  if (!inst) throw new Error(`Сборка не найдена: ${name}`)
  const manifest: ModpackManifest = {
    format: 1,
    name: inst.displayName,
    versionId: inst.versionId,
    loader: inst.loader,
    files: readTracked(name),
    createdAt: Date.now()
  }

  const dir = instanceDir(name)
  const zip = new AdmZip()
  let added = false
  const configDir = join(dir, 'config')
  if (existsSync(configDir)) {
    zip.addLocalFolder(configDir, 'config')
    added = true
  }
  for (const f of ['options.txt', 'servers.dat']) {
    const p = join(dir, f)
    if (existsSync(p)) {
      zip.addLocalFile(p)
      added = true
    }
  }
  if (added) {
    const buf = zip.toBuffer()
    if (buf.length <= CONFIG_ZIP_LIMIT) manifest.configZip = buf.toString('base64')
  }
  return manifest
}

export async function importModpack(
  manifest: ModpackManifest,
  newName: string,
  onProgress?: (done: number, total: number) => void
): Promise<Instance> {
  const inst = createInstance({
    name: newName,
    displayName: manifest.name,
    versionId: manifest.versionId,
    loader: manifest.loader,
    source: 'modpack'
  })
  const dir = instanceDir(inst.name)
  let done = 0
  for (const f of manifest.files) {
    if (!f.url) continue
    const subdir = f.subdir ?? 'mods'
    mkdirSync(join(dir, subdir), { recursive: true })
    await download(f.url, join(dir, subdir, f.filename))
    recordInstall(inst.name, f)
    onProgress?.(++done, manifest.files.length)
  }
  if (manifest.configZip) {
    new AdmZip(Buffer.from(manifest.configZip, 'base64')).extractAllTo(dir, true)
  }
  return inst
}