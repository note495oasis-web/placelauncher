import { app, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'game'

export interface LogEntry {
  ts: number
  level: LogLevel
  source: string
  message: string
}

const MAX_ENTRIES = 5000
const entries: LogEntry[] = []
let consoleHooked = false

function format(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ?? arg.message
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function broadcast(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('logs:append', entry)
  }
}

export function log(level: LogLevel, source: string, message: string): void {
  const entry: LogEntry = { ts: Date.now(), level, source, message }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  broadcast(entry)
}

export function logLines(level: LogLevel, source: string, text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) log(level, source, line)
  }
}

export function getLogs(): LogEntry[] {
  return entries.slice()
}

export function clearLogs(): void {
  entries.length = 0
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('logs:cleared')
  }
}

function renderText(list: LogEntry[]): string {
  return list
    .map((e) => `[${new Date(e.ts).toLocaleTimeString('ru-RU', { hour12: false })}] [${e.level}] [${e.source}] ${e.message}`)
    .join('\n')
}

export async function saveLogs(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const options = {
    title: 'Сохранить логи',
    defaultPath: join(app.getPath('documents'), 'placelauncher-logs.txt'),
    filters: [{ name: 'Текстовый файл', extensions: ['txt', 'log'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  writeFileSync(result.filePath, renderText(entries), 'utf8')
  return result.filePath
}

export function initLogger(): void {
  if (consoleHooked) return
  consoleHooked = true
  const wrap =
    (level: LogLevel, original: (...args: any[]) => void) =>
    (...args: any[]): void => {
      original.apply(console, args)
      try {
        log(level, 'app', args.map(format).join(' '))
      } catch {
        // logging must never break the app
      }
    }
  console.log = wrap('info', console.log.bind(console))
  console.info = wrap('info', console.info.bind(console))
  console.warn = wrap('warn', console.warn.bind(console))
  console.error = wrap('error', console.error.bind(console))
  console.debug = wrap('debug', console.debug.bind(console))
  log('info', 'launcher', `PlaceLauncher ${app.getVersion()} запущен`)
}