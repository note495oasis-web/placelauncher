import https from 'https'
import http from 'http'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import type { Agent } from 'http'
import { URL } from 'url'

export interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
  agent?: Agent
  timeout?: number
  maxRedirects?: number
}

const REDIRECT_CODES = [301, 302, 303, 307, 308]

export function requestWithAgent(
  urlStr: string,
  opts: RequestOptions = {},
  redirects = 0
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const onResponse = (res: http.IncomingMessage): void => {
      const status = res.statusCode ?? 0
      if (REDIRECT_CODES.includes(status) && res.headers.location && redirects < (opts.maxRedirects ?? 5)) {
        res.resume()
        const next = new URL(res.headers.location, u).toString()
        requestWithAgent(next, opts, redirects + 1).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    }

    const req =
      u.protocol === 'https:'
        ? https.request(u, { method: opts.method ?? 'GET', headers: opts.headers, agent: opts.agent as unknown as https.Agent }, onResponse)
        : http.request(u, { method: opts.method ?? 'GET', headers: opts.headers, agent: opts.agent }, onResponse)

    req.on('error', reject)
    req.setTimeout(opts.timeout ?? 20000, () => req.destroy(new Error(`Request timeout: ${urlStr}`)))
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

export interface DownloadOptions {
  agent?: Agent
  timeout?: number
  headers?: Record<string, string>
  onProgress?: (received: number, total: number) => void
}

export function downloadWithAgent(
  urlStr: string,
  dest: string,
  opts: DownloadOptions = {},
  redirects = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const onResponse = (res: http.IncomingMessage): void => {
      const status = res.statusCode ?? 0
      if (REDIRECT_CODES.includes(status) && res.headers.location && redirects < 5) {
        res.resume()
        const next = new URL(res.headers.location, u).toString()
        downloadWithAgent(next, dest, opts, redirects + 1).then(resolve).catch(reject)
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`HTTP ${status} while downloading ${urlStr}`))
        return
      }
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let received = 0
      res.on('data', (c: Buffer) => {
        received += c.length
        opts.onProgress?.(received, total)
      })
      pipeline(res, createWriteStream(dest)).then(resolve).catch(reject)
    }

    const req =
      u.protocol === 'https:'
        ? https.request(u, { method: 'GET', headers: opts.headers, agent: opts.agent as unknown as https.Agent }, onResponse)
        : http.request(u, { method: 'GET', headers: opts.headers, agent: opts.agent }, onResponse)

    req.on('error', reject)
    req.setTimeout(opts.timeout ?? 60000, () => req.destroy(new Error(`Download timeout: ${urlStr}`)))
    req.end()
  })
}