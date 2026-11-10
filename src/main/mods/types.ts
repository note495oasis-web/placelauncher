export interface ModProject {
  source: 'modrinth' | 'curseforge'
  id: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  iconUrl?: string
  categories: string[]
}

export interface ModFileDependency {
  projectId: string
  relation: string
}

export interface ModFile {
  id: string
  name: string
  filename: string
  url: string
  size: number
  version: string
  releaseType?: string
  dependencies?: ModFileDependency[]
}

export interface ModSearchOptions {
  gameVersion?: string
  loader?: string
  projectType?: string
  limit?: number
  offset?: number
}