import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { apiJson } from '../net/http'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export interface VersionEntry {
  id: string
  type: string
  url: string
  releaseTime: string
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionEntry[]
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export interface Artifact {
  path: string
  url: string
  sha1: string
  size: number
}

export interface Library {
  name: string
  downloads?: {
    artifact?: Artifact
    classifiers?: Record<string, Artifact>
  }
  natives?: Record<string, string>
  rules?: Rule[]
  extract?: { exclude?: string[] }
  url?: string
}

export interface RuleArg {
  rules: Rule[]
  value: string | string[]
}

export interface VersionJson {
  id: string
  type: string
  mainClass: string
  assets: string
  assetIndex: { id: string; url: string; sha1: string; size: number; totalSize: number }
  downloads: { client: Artifact; client_mappings?: Artifact }
  libraries: Library[]
  javaVersion?: { component: string; majorVersion: number }
  arguments?: { game: (string | RuleArg)[]; jvm: (string | RuleArg)[] }
  minecraftArguments?: string
  inheritsFrom?: string
  releaseTime?: string
}

export function osName(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

export function osArch(): string {
  return process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'x86'
}

export function ruleApplies(rule: Rule, features: Record<string, boolean> = {}): boolean {
  let applies = true
  if (rule.os) {
    if (rule.os.name && rule.os.name !== osName()) applies = false
    if (rule.os.arch && rule.os.arch !== osArch()) applies = false
    if (rule.os.version) {
      try {
        applies = applies && new RegExp(rule.os.version).test(process.version)
      } catch {
        applies = false
      }
    }
  }
  if (rule.features) {
    for (const [key, want] of Object.entries(rule.features)) {
      if (Boolean(features[key]) !== want) applies = false
    }
  }
  return applies
}

export function isLibraryAllowed(lib: Library, features: Record<string, boolean> = {}): boolean {
  if (!lib.rules || lib.rules.length === 0) return true
  let allowed = false
  for (const rule of lib.rules) {
    if (ruleApplies(rule, features)) allowed = rule.action === 'allow'
  }
  return allowed
}

export async function fetchManifest(): Promise<VersionManifest> {
  return apiJson<VersionManifest>(MANIFEST_URL)
}

export async function fetchVersionJson(
  gameDir: string,
  entry: VersionEntry,
  force = false
): Promise<VersionJson> {
  const dir = join(gameDir, 'versions', entry.id)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${entry.id}.json`)
  if (!force && existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as VersionJson
    } catch {
      // refetch on corrupt cache
    }
  }
  const json = await apiJson<VersionJson>(entry.url)
  writeFileSync(file, JSON.stringify(json, null, 2))
  return json
}

export async function resolveInheritance(gameDir: string, json: VersionJson): Promise<VersionJson> {
  if (!json.inheritsFrom) return json
  const manifest = await fetchManifest()
  const parentEntry = manifest.versions.find((v) => v.id === json.inheritsFrom)
  if (!parentEntry) return json
  const parent = await resolveInheritance(gameDir, await fetchVersionJson(gameDir, parentEntry))
  return {
    ...parent,
    ...json,
    libraries: [...(parent.libraries ?? []), ...(json.libraries ?? [])],
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(json.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(json.arguments?.jvm ?? [])]
    },
    minecraftArguments: json.minecraftArguments ?? parent.minecraftArguments
  }
}