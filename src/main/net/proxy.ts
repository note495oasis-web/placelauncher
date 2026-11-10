import type { Agent } from 'http'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { getSettings } from '../store'
import { requestWithAgent } from './raw'

export interface ProxyEndpoint {
  type: 'socks5' | 'http'
  host: string
  port: number
  username?: string
  password?: string
}

interface Candidate extends ProxyEndpoint {
  latency: number
  alive: boolean
}

const CHECK_URL = 'https://api.modrinth.com/v2/project/sodium'
const POOL_TTL_MS = 10 * 60 * 1000
const MAX_CANDIDATES = 200
const CHECK_CONCURRENCY = 25

const SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt',
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all'
]

const SEED: ProxyEndpoint[] = [{ type: 'socks5', host: '4.157.29.42', port: 3001 }]

let pool: Candidate[] = []
let cursor = 0
let lastRefresh = 0
let refreshing: Promise<void> | null = null

export function buildAgent(p: ProxyEndpoint, targetUrl: string): Agent {
  const auth = p.username
    ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password ?? '')}@`
    : ''
  if (p.type === 'socks5') {
    return new SocksProxyAgent(`socks5h://${auth}${p.host}:${p.port}`) as unknown as Agent
  }
  const proxyUrl = `http://${auth}${p.host}:${p.port}`
  return (targetUrl.startsWith('https')
    ? new HttpsProxyAgent(proxyUrl)
    : new HttpProxyAgent(proxyUrl)) as unknown as Agent
}

async function fetchSources(): Promise<ProxyEndpoint[]> {
  const out: ProxyEndpoint[] = [...SEED]
  const seen = new Set<string>(SEED.map((s) => `${s.host}:${s.port}`))
  await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const res = await requestWithAgent(src, { timeout: 15000 })
        if (res.status !== 200) return
        for (const line of res.body.toString('utf8').split(/\r?\n/)) {
          const m = line.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$/)
          if (!m) continue
          const key = `${m[1]}:${m[2]}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ type: 'socks5', host: m[1], port: parseInt(m[2], 10) })
        }
      } catch {
        // source unavailable, skip
      }
    })
  )
  return out
}

async function check(p: ProxyEndpoint): Promise<Candidate> {
  const start = Date.now()
  try {
    const res = await requestWithAgent(CHECK_URL, { agent: buildAgent(p, CHECK_URL), timeout: 8000 })
    return { ...p, alive: res.status === 200, latency: Date.now() - start }
  } catch {
    return { ...p, alive: false, latency: Number.MAX_SAFE_INTEGER }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      ret[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return ret
}

export function refreshPool(): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const endpoints = (await fetchSources()).slice(0, MAX_CANDIDATES)
    const checked = await mapLimit(endpoints, CHECK_CONCURRENCY, check)
    pool = checked.filter((c) => c.alive).sort((a, b) => a.latency - b.latency)
    cursor = 0
    lastRefresh = Date.now()
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export function poolStatus(): { count: number; active: string | null; lastRefresh: number } {
  const active = pool.length ? pool[cursor % pool.length] : null
  return { count: pool.length, active: active ? `${active.host}:${active.port}` : null, lastRefresh }
}

export async function resolveAgent(targetUrl: string): Promise<Agent | undefined> {
  const p = getSettings().proxy
  if (p.mode === 'manual') {
    if (!p.host) return undefined
    return buildAgent(p, targetUrl)
  }
  if (p.mode === 'auto') {
    if (pool.length === 0 || Date.now() - lastRefresh > POOL_TTL_MS) await refreshPool()
    if (pool.length === 0) return undefined
    return buildAgent(pool[cursor % pool.length], targetUrl)
  }
  return undefined
}

export function reportAutoFailure(): void {
  if (!pool.length) return
  pool.splice(cursor % pool.length, 1)
  if (cursor >= pool.length) cursor = 0
}

export async function testEndpoint(
  p: ProxyEndpoint
): Promise<{ ok: boolean; latency: number; status: number }> {
  const start = Date.now()
  try {
    const res = await requestWithAgent(CHECK_URL, { agent: buildAgent(p, CHECK_URL), timeout: 10000 })
    return { ok: res.status === 200, latency: Date.now() - start, status: res.status }
  } catch {
    return { ok: false, latency: Date.now() - start, status: 0 }
  }
}