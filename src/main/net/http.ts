import { getSettings } from '../store'
import { resolveAgent, reportAutoFailure } from './proxy'
import { requestWithAgent, downloadWithAgent, type RawResponse, type RequestOptions } from './raw'

export async function apiRequest(url: string, opts: RequestOptions = {}): Promise<RawResponse> {
  const mode = getSettings().proxy.mode
  const maxAttempts = mode === 'auto' ? 4 : 1
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const agent = await resolveAgent(url)
    try {
      return await requestWithAgent(url, { ...opts, agent, timeout: opts.timeout ?? 20000 })
    } catch (err) {
      lastError = err
      if (mode === 'auto') reportAutoFailure()
      else throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`)
}

export async function apiJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRequest(url, opts)
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return JSON.parse(res.body.toString('utf8')) as T
}

export async function download(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  const agent = await resolveAgent(url)
  return downloadWithAgent(url, dest, { agent, onProgress })
}