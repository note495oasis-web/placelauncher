import { join, dirname } from 'path'
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'fs'
import { spawn } from 'child_process'
import { apiJson, download } from '../net/http'
import { gameDir } from './paths'
import { ensureJava } from '../game/java'
import type { InstanceLoader } from '../instances/manager'

export async function installFabric(gameVersion: string, loaderVersion?: string): Promise<string> {
  const gd = gameDir()
  let loader = loaderVersion
  if (!loader) {
    const list = await apiJson<{ loader: { version: string; stable: boolean } }[]>(
      `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`
    )
    const pick = list.find((x) => x.loader.stable) ?? list[0]
    if (!pick) throw new Error(`Fabric не поддерживает версию ${gameVersion}`)
    loader = pick.loader.version
  }
  const profile = await apiJson<{ id: string }>(
    `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loader}/profile/json`
  )
  const dir = join(gd, 'versions', profile.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2))
  return profile.id
}

async function runInstaller(url: string, tag: string, onLog?: (line: string) => void): Promise<void> {
  const gd = gameDir()
  const installer = join(gd, 'installers', `${tag}.jar`)
  mkdirSync(dirname(installer), { recursive: true })
  await download(url, installer)
  const java = await ensureJava(17)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(java.path, ['-jar', installer, '--installClient', gd], { cwd: gd })
    child.stdout?.on('data', (d: Buffer) => onLog?.(d.toString()))
    child.stderr?.on('data', (d: Buffer) => onLog?.(d.toString()))
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Installer ${tag} завершился с кодом ${code}`))))
  })
}

function findInstalledVersion(needle: string): string | null {
  const dir = join(gameDir(), 'versions')
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir)) {
    if (entry.toLowerCase().includes(needle.toLowerCase())) {
      const json = join(dir, entry, `${entry}.json`)
      if (existsSync(json)) return entry
    }
  }
  return null
}

export async function installForge(
  gameVersion: string,
  forgeVersion: string,
  onLog?: (line: string) => void
): Promise<string> {
  const ver = `${gameVersion}-${forgeVersion}`
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${ver}/forge-${ver}-installer.jar`
  await runInstaller(url, `forge-${ver}`, onLog)
  const id = findInstalledVersion(`forge-${forgeVersion}`) ?? findInstalledVersion(gameVersion)
  if (!id) throw new Error('Forge установлен, но не удалось найти созданную версию')
  return id
}

export async function installNeoForge(
  gameVersion: string,
  neoVersion: string,
  onLog?: (line: string) => void
): Promise<string> {
  const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`
  await runInstaller(url, `neoforge-${neoVersion}`, onLog)
  const id = findInstalledVersion(`neoforge-${neoVersion}`)
  if (!id) throw new Error('NeoForge установлен, но не удалось найти созданную версию')
  return id
}

export async function resolveLoaderVersion(
  gameVersion: string,
  loader: InstanceLoader,
  onLog?: (line: string) => void
): Promise<string> {
  switch (loader.type) {
    case 'fabric':
    case 'quilt':
      return installFabric(gameVersion, loader.version)
    case 'forge':
      return installForge(gameVersion, loader.version, onLog)
    case 'neoforge':
      return installNeoForge(gameVersion, loader.version, onLog)
    default:
      return gameVersion
  }
}

export function readLocalVersion(id: string): unknown | null {
  const file = join(gameDir(), 'versions', id, `${id}.json`)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}