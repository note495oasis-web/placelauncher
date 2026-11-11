import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, statSync, createReadStream, copyFileSync } from 'fs'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { download } from '../net/http'
import { isLibraryAllowed, osName, osArch, type VersionJson, type Library } from './versions'

export interface ProgressInfo {
  phase: string
  done: number
  total: number
}

export type ProgressCallback = (info: ProgressInfo) => void

export interface PreparedVersion {
  clientJar: string
  classpath: string[]
  nativesDir: string
  assetIndexName: string
  assetsDir: string
  mainClass: string
  javaMajor: number
  versionJson: VersionJson
}

const ASSET_BASE = 'https://resources.download.minecraft.net'

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function downloadVerified(url: string, dest: string, sha1?: string, size?: number): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest)) {
    if (sha1) {
      if ((await hashFile(dest)) === sha1) return
    } else if (size === undefined || statSync(dest).size === size) {
      return
    }
  }
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await download(url, dest)
      if (sha1 && (await hashFile(dest)) !== sha1) throw new Error(`SHA1 mismatch: ${dest}`)
      return
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Download failed: ${url}`)
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  })
  await Promise.all(runners)
}

function mavenToPath(name: string, baseUrl?: string): { path: string; url: string } {
  const [group, artifact, version, classifier] = name.split(':')
  const base = `${group.replace(/\./g, '/')}/${artifact}/${version}`
  const file = classifier ? `${artifact}-${version}-${classifier}.jar` : `${artifact}-${version}.jar`
  const path = `${base}/${file}`
  const root = baseUrl ?? 'https://libraries.minecraft.net/'
  return { path, url: `${root.replace(/\/+$/, '')}/${path}` }
}

function extractNatives(jar: string, nativesDir: string, exclude: string[] = []): void {
  const zip = new AdmZip(jar)
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const name = entry.entryName
    if (name.startsWith('META-INF/')) continue
    if (exclude.some((ex) => name.startsWith(ex))) continue
    zip.extractEntryTo(entry, nativesDir, false, true)
  }
}

export async function prepareVersion(
  gameDir: string,
  version: VersionJson,
  onProgress?: ProgressCallback
): Promise<PreparedVersion> {
  const report = (phase: string, done: number, total: number): void => onProgress?.({ phase, done, total })

  const clientJar = join(gameDir, 'versions', version.id, `${version.id}.jar`)
  report('Клиент', 0, 1)
  await downloadVerified(version.downloads.client.url, clientJar, version.downloads.client.sha1)
  report('Клиент', 1, 1)

  const libsDir = join(gameDir, 'libraries')
  const nativesDir = join(gameDir, 'natives', version.id)
  mkdirSync(nativesDir, { recursive: true })
  const classpath: string[] = []
  const libTasks: (() => Promise<void>)[] = []

  for (const lib of version.libraries) {
    if (!isLibraryAllowed(lib)) continue
    collectLibrary(lib, libsDir, nativesDir, classpath, libTasks)
  }
  let libDone = 0
  await pool(libTasks, 8, async (task) => {
    await task()
    report('Библиотеки', ++libDone, libTasks.length)
  })

  const assetsDir = join(gameDir, 'assets')
  const indexName = version.assetIndex.id
  const indexFile = join(assetsDir, 'indexes', `${indexName}.json`)
  await downloadVerified(version.assetIndex.url, indexFile, version.assetIndex.sha1)
  const index = JSON.parse(readFileSync(indexFile, 'utf8')) as {
    objects: Record<string, { hash: string; size: number }>
    virtual?: boolean
    map_to_resources?: boolean
  }

  const entries = Object.entries(index.objects)
  let assetDone = 0
  await pool(entries, 16, async ([, obj]) => {
    const hash = obj.hash
    const sub = hash.slice(0, 2)
    const dest = join(assetsDir, 'objects', sub, hash)
    await downloadVerified(`${ASSET_BASE}/${sub}/${hash}`, dest, hash, obj.size)
    report('Ассеты', ++assetDone, entries.length)
  })

  if (index.virtual || index.map_to_resources) {
    const target = index.map_to_resources
      ? join(gameDir, 'instances', 'resources')
      : join(assetsDir, 'virtual', 'legacy')
    for (const [name, obj] of entries) {
      const src = join(assetsDir, 'objects', obj.hash.slice(0, 2), obj.hash)
      const dest = join(target, name)
      if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(src, dest)
      }
    }
  }

  classpath.push(clientJar)
  return {
    clientJar,
    classpath,
    nativesDir,
    assetIndexName: indexName,
    assetsDir,
    mainClass: version.mainClass,
    javaMajor: version.javaVersion?.majorVersion ?? 8,
    versionJson: version
  }
}

function collectLibrary(
  lib: Library,
  libsDir: string,
  nativesDir: string,
  classpath: string[],
  tasks: (() => Promise<void>)[]
): void {
  if (lib.downloads?.artifact) {
    const art = lib.downloads.artifact
    const dest = join(libsDir, art.path)
    classpath.push(dest)
    tasks.push(() => downloadVerified(art.url, dest, art.sha1, art.size))
  } else if (lib.name && !lib.natives) {
    const { path, url } = mavenToPath(lib.name, lib.url)
    const dest = join(libsDir, path)
    classpath.push(dest)
    tasks.push(() => downloadVerified(url, dest))
  }

  if (lib.natives) {
    const key = lib.natives[osName()]
    if (key) {
      const classifier = key.replace('${arch}', osArch() === 'x64' ? '64' : '32')
      const nat = lib.downloads?.classifiers?.[classifier]
      if (nat) {
        const dest = join(libsDir, nat.path)
        tasks.push(async () => {
          await downloadVerified(nat.url, dest, nat.sha1, nat.size)
          extractNatives(dest, nativesDir, lib.extract?.exclude)
        })
      }
    }
  }
}