import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api, errText, formatDate } from '../lib'
import { useToast } from './toast'
import { Button, SectionTitle, Badge, Modal, Progress, Spinner, EmptyState } from './ui'
import { IconPlay, IconStop, IconPlus, IconDownload, IconEdit, IconFolder, IconTrash, IconCube, IconCopy, IconSearch } from './Icons'
import InstanceEditorModal from './InstanceEditorModal'

function coverStyle(inst: LauncherInstance, image?: string): CSSProperties {
  if (image) return { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  let h = inst.coverHue
  if (h === undefined) {
    let hash = 0
    for (const c of inst.name) hash = (hash * 31 + c.charCodeAt(0)) % 1000
    h = 90 + (hash % 80)
  }
  return { background: `linear-gradient(135deg, hsl(${h} 55% 26%), hsl(${h + 30} 65% 12%))` }
}

export default function PlayScreen({
  refreshToken,
  onCreate
}: {
  refreshToken: number
  onCreate: () => void
}): JSX.Element {
  const toast = useToast()
  const [instances, setInstances] = useState<LauncherInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const consoleRef = useRef<HTMLDivElement>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importable, setImportable] = useState<ImportableInstance[]>([])
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [editing, setEditing] = useState<LauncherInstance | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')

  const selected = instances.find((i) => i.name === selectedName) ?? instances[0] ?? null
  const filtered = query.trim()
    ? instances.filter((i) => `${i.displayName} ${i.name} ${i.versionId}`.toLowerCase().includes(query.trim().toLowerCase()))
    : instances

  useEffect(() => {
    refresh()
    api.isGameRunning().then(setRunning)
    api.onGameProgress((p) => setProgress(p))
    api.onGameLog((line) => setLogs((prev) => [...prev.slice(-499), line]))
    return () => api.offGameEvents()
  }, [refreshToken])

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
  }, [logs])

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const list = await api.listInstances()
      setInstances(list)
      setSelectedName((prev) => (prev && list.some((i) => i.name === prev) ? prev : list[0]?.name ?? null))
      const entries = await Promise.all(
        list.map(async (i) => [i.name, await api.getCover(i.name).catch(() => null)] as const)
      )
      setCovers(Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e[1])))
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function scanImport(): Promise<void> {
    setImportOpen(true)
    setScanning(true)
    try {
      setImportable(await api.scanImportable())
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setScanning(false)
    }
  }

  async function importOne(info: ImportableInstance): Promise<void> {
    setImporting(info.path)
    try {
      const inst = await api.importPrism(info)
      const mods = await api.listContent(inst.name, 'mods').catch(() => [] as string[])
      toast(`Импортировано: ${info.name} (модов: ${mods.length})`, 'success')
      setImportable((prev) => prev.filter((i) => i.path !== info.path))
      await refresh()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setImporting(null)
    }
  }

  async function launch(inst: LauncherInstance): Promise<void> {
    setLaunching(inst.name)
    setLogs([])
    setProgress({ phase: 'Подготовка', done: 0, total: 1 })
    try {
      await api.launchGame({ instanceName: inst.name, versionId: inst.versionId })
      setRunning(true)
      toast(`Запущено: ${inst.displayName}`, 'success')
      await refresh()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setLaunching(null)
      setProgress(null)
      api.isGameRunning().then(setRunning)
    }
  }

  async function stop(): Promise<void> {
    await api.stopGame()
    setRunning(false)
    toast('Игра остановлена.', 'info')
  }

  async function remove(inst: LauncherInstance): Promise<void> {
    if (!window.confirm(`Удалить сборку «${inst.displayName}»?`)) return
    try {
      setInstances(await api.deleteInstance(inst.name))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function openFolder(inst: LauncherInstance): Promise<void> {
    const err = await api.openInstanceFolder(inst.name)
    if (err) toast(err, 'error')
  }

  async function duplicate(inst: LauncherInstance): Promise<void> {
    try {
      setInstances(await api.duplicateInstance(inst.name))
      toast(`Создана копия: ${inst.displayName}`, 'success')
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  return (
    <div className="screen play-screen">
      <SectionTitle
        action={
          <div className="btn-row">
            <Button variant="ghost" onClick={scanImport}><span className="btn-ic"><IconDownload size={15} /></span>Импорт из Prism</Button>
            <Button onClick={onCreate}><span className="btn-ic"><IconPlus size={15} /></span>Создать экземпляр</Button>
          </div>
        }
      >
        Играть
      </SectionTitle>

      {loading ? (
        <Spinner label="Загрузка сборок…" />
      ) : !selected ? (
        <EmptyState
          title="Экземпляров пока нет"
          text="Создайте новый экземпляр или импортируйте существующие из Prism Launcher / MultiMC."
          action={<Button onClick={onCreate}><span className="btn-ic"><IconPlus size={15} /></span>Создать экземпляр</Button>}
        />
      ) : (
        <>
          <div className="hero" style={coverStyle(selected, covers[selected.name])}>
            <div className="hero-cover"><IconCube size={46} /></div>
            <div className="hero-info">
              <h1 className="hero-title">{selected.displayName}</h1>
              <div className="instance-tags">
                <Badge tone="accent">{selected.versionId}</Badge>
                {selected.loader && <Badge>{selected.loader.type} {selected.loader.version}</Badge>}
                <Badge tone="green">{selected.source ?? 'created'}</Badge>
              </div>
              <div className="muted small hero-meta">Играл: {formatDate(selected.lastPlayed)}</div>
            </div>
            <div className="hero-actions">
              {running ? (
                <button className="play-big stop" onClick={stop}>
                  <IconStop size={18} /> Остановить
                </button>
              ) : (
                <button className="play-big" data-tour="hero-play" onClick={() => launch(selected)} disabled={!!launching}>
                  <IconPlay size={18} /> {launching === selected.name ? 'Запуск…' : 'Играть'}
                </button>
              )}
              <div className="hero-icons">
                <button className="icon-btn" title="Редактировать" onClick={() => setEditing(selected)}><IconEdit size={16} /></button>
                <button className="icon-btn" title="Дублировать" onClick={() => duplicate(selected)}><IconCopy size={16} /></button>
                <button className="icon-btn" title="Папка экземпляра" onClick={() => openFolder(selected)}><IconFolder size={16} /></button>
                <button className="icon-btn danger" title="Удалить" onClick={() => remove(selected)}><IconTrash size={16} /></button>
              </div>
            </div>
          </div>

          {(launching || running) && (
            <div className="card launch-panel">
              <div className="launch-head">
                <strong>{launching ? `Запуск: ${launching}` : 'Игра запущена'}</strong>
                {running && <Button variant="danger" onClick={stop}>Остановить</Button>}
              </div>
              {progress && <Progress value={progress.done} max={progress.total || 1} label={progress.phase} />}
              {logs.length > 0 && (
                <div className="console" ref={consoleRef}>
                  {logs.map((l, i) => (
                    <div key={i} className="console-line">{l}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid-head">
            <h3>Все экземпляры</h3>
            <div className="grid-head-right">
              <div className="instance-search">
                <IconSearch size={14} />
                <input
                  className="input"
                  placeholder="Поиск экземпляров…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <span className="muted small">{filtered.length}</span>
            </div>
          </div>
          <div className="instance-grid">
            {filtered.map((inst) => (
              <div
                key={inst.name}
                className={`instance-card ${selected.name === inst.name ? 'selected' : ''}`}
                onClick={() => setSelectedName(inst.name)}
              >
                <div className="card-cover" style={coverStyle(inst, covers[inst.name])}>
                  {!covers[inst.name] && <IconCube size={30} />}
                  <button
                    className="card-play"
                    title="Играть"
                    disabled={!!launching || running}
                    onClick={(e) => { e.stopPropagation(); void launch(inst) }}
                  >
                    <IconPlay size={15} />
                  </button>
                </div>
                <div className="card-body">
                  <strong className="card-title">{inst.displayName}</strong>
                  <div className="instance-tags">
                    <Badge tone="accent">{inst.versionId}</Badge>
                    {inst.loader && <Badge>{inst.loader.type}</Badge>}
                  </div>
                  <div className="muted small card-meta">{formatDate(inst.lastPlayed)}</div>
                </div>
                <div className="card-actions">
                  <button className="icon-btn" title="Редактировать" onClick={(e) => { e.stopPropagation(); setEditing(inst) }}><IconEdit size={14} /></button>
                  <button className="icon-btn" title="Дублировать" onClick={(e) => { e.stopPropagation(); void duplicate(inst) }}><IconCopy size={14} /></button>
                  <button className="icon-btn" title="Папка экземпляра" onClick={(e) => { e.stopPropagation(); void openFolder(inst) }}><IconFolder size={14} /></button>
                  <button className="icon-btn danger" title="Удалить" onClick={(e) => { e.stopPropagation(); void remove(inst) }}><IconTrash size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <EmptyState title="Ничего не найдено" text={`По запросу «${query}» экземпляров нет.`} />
          )}
        </>
      )}

      <Modal open={importOpen} title="Импорт из других лаунчеров" onClose={() => setImportOpen(false)} wide>
        {scanning ? (
          <Spinner label="Поиск сборок Prism / MultiMC…" />
        ) : importable.length === 0 ? (
          <EmptyState title="Ничего не найдено" text="Сборки Prism Launcher и MultiMC не обнаружены." />
        ) : (
          <div className="import-list">
            {importable.map((info) => (
              <div key={info.path} className="import-row">
                <div className="account-meta">
                  <strong>{info.name}</strong>
                  <span className="muted small">{info.versionId}{info.loader ? ` · ${info.loader.type}` : ''}</span>
                  <span className="muted small">{info.path}</span>
                </div>
                <Button variant="subtle" disabled={importing !== null} onClick={() => importOne(info)}>
                  {importing === info.path ? 'Импорт…' : 'Импортировать'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <InstanceEditorModal instance={editing} onClose={() => setEditing(null)} onChanged={refresh} />
    </div>
  )
}