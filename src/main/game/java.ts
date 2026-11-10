import { execFile } from 'child_process'
import { join } from 'path'
import { existsSync, readdirSync, mkdirSync, statSync, rmSync } from 'fs'
import AdmZip from 'adm-zip'
import { getSettings } from '../store'
import { apiJson, download } from '../net/http'
import { osArch } from './versions'
import { gameDir } from './paths'

export interface JavaInfo {
  path: string
  major: number
}

function probe(javaPath: string): Promise<JavaInfo | null> {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) return resolve(null)
      const out = `${stderr ?? ''}${stdout ?? ''}`
      const m = out.match(/version "([^"]+)"/)
      if (!m) return resolve(null)
      const ver = m[1]
      const major = ver.startsWith('1.') ? parseInt(ver.split('.')[1], 10) : parseInt(ver.split('.')[0], 10)
      if (Number.isNaN(major)) return resolve(null)
      resolve({ path: javaPath, major })
    })
  })
}

function candidatePaths(): string[] {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  const out: string[] = []
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(
      (r): r is string => Boolean(r)
    )
    const vendors = ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft']
    for (const root of roots) {
      for (const vendor of vendors) {
        const dir = join(root, vendor)
        if (!existsSync(dir)) continue
        for (const entry of readdirSync(dir)) {
          const jp = join(dir, entry, 'bin', exe)
          if (existsSync(jp)) out.push(jp)
        }
      }
    }
  } else {
    out.push('/usr/bin/java', '/usr/local/bin/java')
    const jvm = '/usr/lib/jvm'
    if (existsSync(jvm)) {
      for (const entry of readdirSync(jvm)) out.push(join(jvm, entry, 'bin', exe))
    }
  }
  return out
}

function downloadedJavas(): string[] {
  const root = join(gameDir(), 'java')
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry)
    if (!statSync(dir).isDirectory()) continue
    const exe = findJavaExeUnder(dir)
    if (exe) out.push(exe)
  }
  return out
}

function select(infos: JavaInfo[], required: number): JavaInfo | null {
  const exact = infos.find((i) => i.major === required)
  if (exact) return exact
  if (required >= 16) {
    const sufficient = infos.filter((i) => i.major >= required).sort((a, b) => a.major - b.major)[0]
    if (sufficient) return sufficient
  }
  return null
}

async function pickFrom(paths: string[], required: number): Promise<JavaInfo | null> {
  const infos: JavaInfo[] = []
  for (const p of paths) {
    if (!p) continue
    const info = await probe(p)
    if (info) infos.push(info)
  }
  return select(infos, required)
}

export async function findJava(): Promise<JavaInfo | null> {
  const manual = getSettings().javaPath
  if (manual && existsSync(manual)) {
    const p = await probe(manual)
    if (p) return p
  }
  for (const c of [...downloadedJavas(), 'java', ...candidatePaths()]) {
    const p = await probe(c)
    if (p) return p
  }
  return null
}

function targetMajor(required: number): number {
  if (required <= 8) return 8
  if (required <= 11) return 11
  if (required <= 17) return 17
  return 21
}

export async function ensureJava(
  requiredMajor: number,
  gd: string = gameDir(),
  onProgress?: (received: number, total: number) => void
): Promise<JavaInfo> {
  const manual = getSettings().javaPath
  const local = await pickFrom([manual, ...downloadedJavas()], requiredMajor)
  if (local) return local
  const system = await pickFrom(['java', ...candidatePaths()], requiredMajor)
  if (system) return system
  return downloadJava(targetMajor(requiredMajor), gd, onProgress)
}

function findJavaExeUnder(dir: string): string | null {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null
  const direct = join(dir, 'bin', exe)
  if (existsSync(direct)) return direct
  for (const entry of readdirSync(dir)) {
    const jp = join(dir, entry, 'bin', exe)
    if (existsSync(jp)) return jp
  }
  return null
}

export async function downloadJava(
  major: number,
  gd: string = gameDir(),
  onProgress?: (received: number, total: number) => void
): Promise<JavaInfo> {
  if (process.platform !== 'win32') {
    throw new Error('Автозагрузка Java доступна только на Windows. Установите Java вручную и укажите путь в настройках.')
  }
  const arch = osArch() === 'arm64' ? 'aarch64' : 'x64'
  const assets = await apiJson<{ binary: { package: { link: string } } }[]>(
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&os=windows&vendor=eclipse`
  )
  if (!assets.length) throw new Error(`Adoptium не нашёл JRE ${major}`)
  const javaRoot = join(gd, 'java')
  const destDir = join(javaRoot, `jre-${major}`)
  mkdirSync(destDir, { recursive: true })
  const archive = join(javaRoot, `jre-${major}.zip`)
  await download(assets[0].binary.package.link, archive, onProgress)
  new AdmZip(archive).extractAllTo(destDir, true)
  rmSync(archive, { force: true })
  const exe = findJavaExeUnder(destDir)
  if (!exe) throw new Error('Не удалось найти java.exe после распаковки')
  const info = await probe(exe)
  if (!info) throw new Error('Скачанная Java не запускается')
  return info
}