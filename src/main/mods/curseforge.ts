import { apiJson } from '../net/http'
import { getSettings } from '../store'
import type { ModProject, ModFile, ModSearchOptions } from './types'

const BASE = 'https://api.curseforge.com/v1'
const GAME_ID = '432'

function headers(): Record<string, string> {
  const key = getSettings().curseforgeApiKey
  if (!key) {
    throw new Error('Нужен CurseForge API key. Получите его на console.curseforge.com и укажите в настройках.')
  }
  return { 'x-api-key': key, Accept: 'application/json' }
}

interface CfMod {
  id: number
  slug: string
  name: string
  summary: string
  downloadCount: number
  authors?: { name: string }[]
  logo?: { url: string }
  categories?: { name: string }[]
}

interface CfFile {
  id: number
  displayName: string
  fileName: string
  downloadUrl: string | null
  fileLength: number
  gameVersions: string[]
  releaseType: number
  dependencies?: { modId: number; relationType: number }[]
}

export async function searchCurseforge(query: string, opts: ModSearchOptions = {}): Promise<ModProject[]> {
  const params = new URLSearchParams({
    gameId: GAME_ID,
    classId: opts.projectType === 'modpack' ? '4471' : '6',
    searchFilter: query,
    pageSize: String(opts.limit ?? 20),
    index: String(opts.offset ?? 0)
  })
  if (!query.trim()) {
    params.set('sortField', '2')
    params.set('sortOrder', 'desc')
  }
  if (opts.gameVersion) params.set('gameVersion', opts.gameVersion)
  const res = await apiJson<{ data: CfMod[] }>(`${BASE}/mods/search?${params.toString()}`, { headers: headers() })
  return res.data.map((m) => ({
    source: 'curseforge',
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    author: m.authors?.[0]?.name ?? '',
    downloads: m.downloadCount,
    iconUrl: m.logo?.url,
    categories: (m.categories ?? []).map((c) => c.name)
  }))
}

export async function getCurseforgeFile(
  modId: string,
  fileId: string
): Promise<{ url: string; filename: string; size: number }> {
  const res = await apiJson<{ data: CfFile }>(`${BASE}/mods/${modId}/files/${fileId}`, { headers: headers() })
  return { url: res.data.downloadUrl ?? '', filename: res.data.fileName, size: res.data.fileLength }
}

export async function getCurseforgeFiles(modId: string, opts: ModSearchOptions = {}): Promise<ModFile[]> {
  const params = new URLSearchParams({ pageSize: '50' })
  if (opts.gameVersion) params.set('gameVersion', opts.gameVersion)
  const res = await apiJson<{ data: CfFile[] }>(`${BASE}/mods/${modId}/files?${params.toString()}`, {
    headers: headers()
  })
  return res.data.map((f) => ({
    id: String(f.id),
    name: f.displayName,
    filename: f.fileName,
    url: f.downloadUrl ?? '',
    size: f.fileLength,
    version: f.gameVersions[0] ?? '',
    releaseType: String(f.releaseType),
    dependencies: (f.dependencies ?? []).map((d) => ({
      projectId: String(d.modId),
      relation: String(d.relationType)
    }))
  }))
}