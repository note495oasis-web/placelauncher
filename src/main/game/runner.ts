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

export interface LaunchRequest {
  versionId?: string
  instanceName: string
}

export async function launchInstance(
  req: LaunchRequest,
  onProgress: (info: ProgressInfo) => void,
  onLog: (line: string) => void
): Promise<number> {
  if (running) throw new Error('Игра уже запущена')
  const account = getActive()
  if (!account) throw new Error('Сначала выберите аккаунт в настройках')

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
  const java = await ensureJava(prepared.javaMajor, gd, (received, total) =>
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
    authlibInjector: injector
  })
  running = child
  touchPlayed(req.instanceName)
  child.stdout?.on('data', (d: Buffer) => onLog(d.toString()))
  child.stderr?.on('data', (d: Buffer) => onLog(d.toString()))

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      running = null
      reject(err)
    })
    child.on('exit', (code) => {
      running = null
      resolve(code ?? 0)
    })
  })
}

export function stopGame(): void {
  running?.kill()
  running = null
}

export function isRunning(): boolean {
  return running !== null
}