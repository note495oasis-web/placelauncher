import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { ChildProcess } from 'child_process'
import { getSettings } from '../store'
import { getActive } from '../auth/accounts'
import { ensureAuthlibInjector } from '../auth/authlib'
import { fetchManifest, fetchVersionJson, resolveInheritance, type VersionJson } from './versions'
import { prepareVersion, type ProgressInfo } from './download'
import { ensureJava } from './java'
import { spawnGame } from './launch'
import { gameDir } from './paths'
import { resolveLoaderVersion } from './loaders'
import { getInstance, touchPlayed } from '../instances/manager'

export { gameDir } from './paths'

let running: ChildProcess | null = null
let manualStop = false
let launchStartedAt = 0
const logTail: string[] = []
const LOG_TAIL_MAX = 400

export interface LaunchRequest {
  versionId?: string
  instanceName: string
}

export function getLastGameLog(): string[] {
  return logTail
}

export function getLaunchStartedAt(): number {
  return launchStartedAt
}

export async function launchInstance(
  req: LaunchRequest,
  onProgress: (info: ProgressInfo) => void,
  onLog: (line: string) => void
): Promise<number> {
  if (running) throw new Error('Игра уже запущена')
  const account = getActive()
  if (!account) throw new Error('Сначала выберите аккаунт в настройках')
  manualStop = false
  launchStartedAt = Date.now()
  logTail.length = 0

  const gd = gameDir()
  const inst = getInstance(req.instanceName)
  let versionId = req.versionId ?? inst?.versionId
  if (!versionId) throw new Error('Не указана версия для запуска')

  if (inst?.loader) {
    onProgress({ phase: 'Загрузчик модов', done: 0, total: 1 })
    versionId = await resolveLoaderVersion(inst.versionId, inst.loader, onLog)
    onProgress({ phase: 'Загрузчик модов', done: 1, total: 1 })
  }

  onProgress({ phase: 'Метаданные', done: 0, total: 1 })
  const manifest = await fetchManifest()
  const entry = manifest.versions.find((v) => v.id === versionId)
  let version: VersionJson
  if (entry) {
    version = await fetchVersionJson(gd, entry)
  } else {
    const local = join(gd, 'versions', versionId, `${versionId}.json`)
    if (!existsSync(local)) throw new Error(`Версия не найдена: ${versionId}`)
    version = JSON.parse(readFileSync(local, 'utf8')) as VersionJson
  }
  version = await resolveInheritance(gd, version)
  onProgress({ phase: 'Метаданные', done: 1, total: 1 })

  const prepared = await prepareVersion(gd, version, onProgress)

  onProgress({ phase: 'Java', done: 0, total: 1 })
  const javaMajor = inst?.javaMajor ?? prepared.javaMajor
  const java = await ensureJava(javaMajor, gd, (received, total) =>
    onProgress({ phase: 'Java (загрузка)', done: received, total: total || 1 })
  )
  onProgress({ phase: 'Java', done: 1, total: 1 })

  const instanceDir = join(gd, 'instances', req.instanceName)
  let injector: string | undefined
  if (account.type === 'authlib') {
    injector = await ensureAuthlibInjector(join(gd, 'authlib'))
  }

  const child = spawnGame({
    account,
    prepared,
    instanceDir,
    javaPath: java.path,
    memoryMb: inst?.memoryMb ?? getSettings().memoryMb,
    width: inst?.width,
    height: inst?.height,
    extraJvmArgs: inst?.javaArgs ? inst.javaArgs.split(/\s+/).filter(Boolean) : undefined,
    authlibInjector: injector
  })
  running = child
  touchPlayed(req.instanceName)
  const feed = (chunk: string): void => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) {
        logTail.push(line)
        if (logTail.length > LOG_TAIL_MAX) logTail.splice(0, logTail.length - LOG_TAIL_MAX)
      }
    }
    onLog(chunk)
  }
  child.stdout?.on('data', (d: Buffer) => feed(d.toString()))
  child.stderr?.on('data', (d: Buffer) => feed(d.toString()))

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      running = null
      reject(err)
    })
    child.on('exit', (code) => {
      running = null
      resolve(manualStop ? 0 : (code ?? 0))
    })
  })
}

export function stopGame(): void {
  manualStop = true
  running?.kill()
  running = null
}

export function isRunning(): boolean {
  return running !== null
}