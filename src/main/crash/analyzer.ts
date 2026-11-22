import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, readFileSync } from 'fs'
import { getInstance, updateInstance, instanceDir } from '../instances/manager'
import { listContentFiles } from '../mods/install'
import { searchModrinth, getModrinthVersions } from '../mods/modrinth'
import { installTrackedMod } from '../instances/modpack'
import { listBackups, restoreBackup } from '../instances/backups'
import { getSettings } from '../store'

export interface CrashFix {
  kind: 'disable-mods' | 'install-mod' | 'set-memory' | 'set-java' | 'restore-backup'
  label: string
  files?: string[]
  modId?: string
  memoryMb?: number
  javaMajor?: number
  backupId?: string
}

export interface CrashAnalysis {
  summary: string
  errorLine?: string
  reportRel?: string
  fixes: CrashFix[]
}

const CLASS_MAJOR_TO_JAVA = 44 // class major 65 = Java 21

function modsList(name: string): string[] {
  try {
    return listContentFiles(instanceDir(name), 'mods').filter((f) => f.toLowerCase().endsWith('.jar'))
  } catch {
    return []
  }
}

function jarsMentioned(text: string, jars: string[]): string[] {
  const found: string[] = []
  for (const j of jars) {
    if (text.includes(j)) found.push(j)
  }
  return found
}

function disableFix(jars: string[]): CrashFix | null {
  if (!jars.length) return null
  return {
    kind: 'disable-mods',
    label: `Отключить моды: ${jars.slice(0, 3).join(', ')}${jars.length > 3 ? ` и ещё ${jars.length - 3}` : ''}`,
    files: jars
  }
}

function newestCrashReport(name: string, sinceTs: number): string | null {
  const dir = join(instanceDir(name), 'crash-reports')
  if (!existsSync(dir)) return null
  let newest: { file: string; mtime: number } | null = null
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.txt')) continue
    const mtime = statSync(join(dir, f)).mtimeMs
    if (mtime < sinceTs - 5000) continue
    if (!newest || mtime > newest.mtime) newest = { file: f, mtime }
  }
  return newest?.file ?? null
}

export function analyzeCrash(instanceName: string, logTail: string[], sinceTs: number): CrashAnalysis {
  const inst = getInstance(instanceName)
  const versionId = inst?.versionId ?? '?'
  const jars = modsList(instanceName)
  let text = logTail.join('\n')
  const report = newestCrashReport(instanceName, sinceTs)
  if (report) {
    try {
      text += '\n' + readFileSync(join(instanceDir(instanceName), 'crash-reports', report), 'utf8')
    } catch {
      // report unreadable, fall back to log text
    }
  }

  const analysis: CrashAnalysis = { summary: 'Игра упала — точную причину не распознал.', fixes: [] }
  if (report) analysis.reportRel = `crash-reports/${report}`

  const mc = text.match(/Unsupported class file major version (\d+)/i)
  if (mc) {
    const need = Math.max(8, parseInt(mc[1], 10) - CLASS_MAJOR_TO_JAVA)
    analysis.summary = `Мод (или мод-загрузчик) собран под более новый Java — версии ${need}. Текущая Java старее, поэтому игра не стартует.`
    analysis.errorLine = mc[0]
    analysis.fixes.push({
      kind: 'set-java',
      label: `Скачать Java ${need} и использовать её для этой сборки`,
      javaMajor: need
    })
    return finish(analysis, instanceName)
  }

  if (/OutOfMemoryError/i.test(text)) {
    const cur = inst?.memoryMb ?? getSettings().memoryMb ?? 4096
    const next = Math.min(cur + 2048, 16384)
    analysis.summary = cur >= 16384
      ? 'Игре не хватило памяти. Память уже на максимуме — попробуй убрать часть модов или шейдеров.'
      : 'Игре не хватило памяти (OutOfMemoryError). Можно выделить больше оперативки этой сборке.'
    analysis.errorLine = text.match(/.*OutOfMemoryError.*/)?.[0]?.trim()
    if (cur < 16384) {
      analysis.fixes.push({ kind: 'set-memory', label: `Выделить ${(next / 1024).toFixed(1)} ГБ памяти вместо ${(cur / 1024).toFixed(1)} ГБ`, memoryMb: next })
    }
    return finish(analysis, instanceName)
  }

  const mentioned = jarsMentioned(text, jars)

  if (/Incompatible mods found!|Mod resolution error|Mod resolution:/i.test(text)) {
    analysis.summary = 'Fabric не смог подобрать совместимые моды: версии модов конфликтуют друг с другом или не подходят к Minecraft.'
    const dep = text.match(/Mod '([\w-]+)' requires '([\w-]+)'/i)
      ?? text.match(/requires \{?modid ([\w-]+)/i)
    if (dep) {
      analysis.fixes.push({ kind: 'install-mod', label: `Установить недостающий мод «${dep[2]}» из Modrinth`, modId: dep[2] })
    }
    const f = disableFix(mentioned)
    if (f) analysis.fixes.push(f)
    return finish(analysis, instanceName)
  }

  if (/Incompatible mod set!|Missing or unsupported mandatory dependencies/i.test(text)) {
    analysis.summary = 'Загрузчик модов не смог собрать набор модов: у мода не хватает зависимости или моды несовместимы с версией Minecraft.'
    const dep = text.match(/Mod ID[: ]*'?([\w-]+)/i) ?? text.match(/modid[=:\s]+([\w-]+)/i)
    if (dep) {
      analysis.fixes.push({ kind: 'install-mod', label: `Установить недостающий мод «${dep[1]}» из Modrinth`, modId: dep[1] })
    }
    const f = disableFix(mentioned)
    if (f) analysis.fixes.push(f)
    return finish(analysis, instanceName)
  }

  if (/Duplicate mods found on the classpath/i.test(text)) {
    analysis.summary = 'Один и тот же мод лежит в папке дважды (или двумя разными файлами) — загрузчик отказывается стартовать.'
    const f = disableFix(mentioned)
    if (f) analysis.fixes.push(f)
    return finish(analysis, instanceName)
  }

  if (/Mixin apply .* failed|MixinTargetNotFound|incompatible mixin/i.test(text)) {
    analysis.summary = 'Мод-миксин несовместим с этой версией игры или другим модом — обычно виноват мод, который недавно добавил.'
    const f = disableFix(mentioned)
    if (f) analysis.fixes.push(f)
    return finish(analysis, instanceName)
  }

  if (/not a valid mod file|Invalid mod file|missing mods\.toml|Unsupported mod file|Unknown mod/i.test(text)) {
    analysis.summary = 'Один из файлов в папке mods не является рабочим модом для этой версии (или побился при скачивании).'
    const f = disableFix(mentioned)
    if (f) analysis.fixes.push(f)
    return finish(analysis, instanceName)
  }

  const err = text.match(/^\s*(Caused by: .{8,}|[\w.$]+(?:Exception|Error): .{8,})\s*$/m)
  if (err) {
    analysis.summary = `Игра упала с ошибкой: ${err[1].split(':').slice(0, 2).join(':').trim()}.`
    analysis.errorLine = err[1].trim()
  } else {
    analysis.errorLine = logTail.filter((l) => l.trim()).slice(-3).join('\n').trim() || undefined
  }
  if (mentioned.length) {
    const f = disableFix(mentioned)
    if (f) analysis.fixes.push(f)
  }
  return finish(analysis, instanceName)
}

function finish(analysis: CrashAnalysis, instanceName: string): CrashAnalysis {
  const backups = listBackups(instanceName).filter((b) => !b.auto || b.label !== 'перед восстановлением')
  const last = backups[0]
  if (last) {
    analysis.fixes.push({
      kind: 'restore-backup',
      label: `Откатить сборку к бэкапу от ${new Date(last.ts).toLocaleString('ru-RU')}`,
      backupId: last.id
    })
  }
  return analysis
}

export async function applyFix(instanceName: string, fix: CrashFix): Promise<string> {
  switch (fix.kind) {
    case 'disable-mods': {
      const dir = join(instanceDir(instanceName), 'disabled-mods')
      mkdirSync(dir, { recursive: true })
      const moved: string[] = []
      for (const f of fix.files ?? []) {
        const safe = f.replace(/[<>:"/\\|?*]/g, '_')
        const src = join(instanceDir(instanceName), 'mods', safe)
        if (!existsSync(src)) continue
        let dest = join(dir, safe)
        if (existsSync(dest)) {
          const dot = safe.lastIndexOf('.')
          dest = join(dir, dot > 0 ? `${safe.slice(0, dot)}-${Date.now()}${safe.slice(dot)}` : `${safe}-${Date.now()}`)
        }
        renameSync(src, dest)
        moved.push(safe)
      }
      if (!moved.length) throw new Error('Эти моды уже отключены или удалены.')
      return `Отключил: ${moved.join(', ')} (лежат в disabled-mods, можно вернуть обратно)`
    }
    case 'install-mod': {
      const inst = getInstance(instanceName)
      if (!inst) throw new Error('Сборка не найдена')
      const id = fix.modId ?? ''
      const opts = { gameVersion: inst.versionId, loader: inst.loader?.type, limit: 10 }
      const projects = await searchModrinth(id, opts)
      const proj = projects.find((p) => p.slug === id) ?? projects[0]
      if (!proj) throw new Error(`В Modrinth не нашёл мод «${id}» для Minecraft ${inst.versionId}`)
      const files = await getModrinthVersions(proj.id, opts)
      const file = files[0]
      if (!file) throw new Error(`Для Minecraft ${inst.versionId} нет подходящей версии мода «${proj.title}»`)
      await installTrackedMod(instanceName, 'modrinth', proj.id, { url: file.url, filename: file.filename, size: file.size }, 'mods')
      return `Установил: ${file.filename}`
    }
    case 'set-memory': {
      updateInstance(instanceName, { memoryMb: fix.memoryMb })
      return `Теперь памяти ${(fix.memoryMb! / 1024).toFixed(1)} ГБ`
    }
    case 'set-java': {
      updateInstance(instanceName, { javaMajor: fix.javaMajor })
      return `Сборка будет запускаться на Java ${fix.javaMajor} (скачается автоматически при запуске)`
    }
    case 'restore-backup': {
      restoreBackup(instanceName, fix.backupId ?? '')
      return 'Сборка откатилась к бэкапу'
    }
  }
}
