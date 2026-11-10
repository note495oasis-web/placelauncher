import { apiJson } from '../net/http'
import type { ModProject, ModFile, ModSearchOptions } from './types'

const BASE = 'https://api.modrinth.com/v2'

interface ModrinthHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  icon_url?: string
  categories?: string[]
}

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  game_versions: string[]
  version_type: string
  files: { url: string; filename: string; primary: boolean; size: number }[]
  dependencies: { project_id: string; dependency_type: string }[]
}

export async function searchModrinth(query: string, opts: ModSearchOptions = {}): Promise<ModProject[]> {
  const facets: string[][] = [[`project_type:${opts.projectType ?? 'mod'}`]]
  if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`])
  if (opts.loader) facets.push([`categories:${opts.loader}`])
  const params = new URLSearchParams({
    query,
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
    index: query.trim() ? 'relevance' : 'downloads',
    facets: JSON.stringify(facets)
  })
  const res = await apiJson<{ hits: ModrinthHit[] }>(`${BASE}/search?${params.toString()}`)
  return res.hits.map((h) => ({
    source: 'modrinth',
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    author: h.author,
    downloads: h.downloads,
    iconUrl: h.icon_url,
    categories: h.categories ?? []
  }))
}

export async function getModrinthVersions(projectId: string, opts: ModSearchOptions = {}): Promise<ModFile[]> {
  const params = new URLSearchParams()
  if (opts.gameVersion) params.set('game_versions', JSON.stringify([opts.gameVersion]))
  if (opts.loader) params.set('loaders', JSON.stringify([opts.loader]))
  const qs = params.toString()
  const versions = await apiJson<ModrinthVersion[]>(
    `${BASE}/project/${projectId}/version${qs ? `?${qs}` : ''}`
  )
  return versions
    .filter((v) => v.files.length > 0)
    .map((v) => {
      const file = v.files.find((f) => f.primary) ?? v.files[0]
      return {
        id: v.id,
        name: v.name,
        filename: file.filename,
        url: file.url,
        size: file.size,
        version: v.game_versions[0] ?? '',
        releaseType: v.version_type,
        dependencies: (v.dependencies ?? []).map((d) => ({
          projectId: d.project_id,
          relation: d.dependency_type
        }))
      }
    })
}