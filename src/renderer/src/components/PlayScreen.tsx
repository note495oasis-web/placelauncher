import { useEffect, useRef, useState } from 'react'
import { api, errText, formatDate } from '../lib'
import { useToast } from './toast'
import { Button, SectionTitle, Badge, Modal, Progress, Spinner, EmptyState } from './ui'
import InstanceEditorModal from './InstanceEditorModal'

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

  const [shareCode, setShareCode] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [editing, setEditing] = useState<LauncherInstance | null>(null)

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
      setInstances(await api.listInstances())
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

  async function share(inst: LauncherInstance): Promise<void> {
    setSharing(true)
    try {
      setShareCode(await api.shareInstance(inst.name))
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="screen play-screen">
      <SectionTitle
        action={
          <div className="btn-row">
            <Button variant="subtle" onClick={scanImport}>Импорт из Prism</Button>
            <Button onClick={onCreate}>Создать экземпляр</Button>
          </div>
        }
      >
        Играть
      </SectionTitle>

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

      {loading ? (
        <Spinner label="Загрузка сборок…" />
      ) : instances.length === 0 ? (
        <EmptyState
          title="Экземпляров пока нет"
          text="Создайте новый экземпляр или импортируйте существующие из Prism Launcher / MultiMC."
          action={<Button onClick={onCreate}>Создать экземпляр</Button>}
        />
      ) : (
        <div className="instance-grid">
          {instances.map((inst) => (
            <div key={inst.name} className="instance-card">
              <div className="instance-top">
                <h3>{inst.displayName}</h3>
                <div className="instance-tags">
                  <Badge tone="accent">{inst.versionId}</Badge>
                  {inst.loader && <Badge>{inst.loader.type} {inst.loader.version}</Badge>}
                </div>
              </div>
              <div className="muted small">Играл: {formatDate(inst.lastPlayed)} · {inst.source ?? 'created'}</div>
              <div className="btn-row">
                <Button onClick={() => launch(inst)} disabled={!!launching || running}>
                  {launching === inst.name ? 'Запуск…' : 'Играть'}
                </Button>
                <Button variant="subtle" onClick={() => setEditing(inst)}>Редактировать</Button>
                <Button variant="subtle" onClick={() => share(inst)} disabled={sharing}>Поделиться</Button>
                <Button
                  variant="subtle"
                  onClick={async () => {
                    const err = await api.openInstanceFolder(inst.name)
                    if (err) toast(err, 'error')
                  }}
                >
                  Папка
                </Button>
                <Button variant="ghost" onClick={() => remove(inst)}>Удалить</Button>
              </div>
            </div>
          ))}
        </div>
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

      <Modal open={!!shareCode} title="Код сборки" onClose={() => setShareCode(null)}>
        <p>Передайте этот код другу — он сможет скачать вашу сборку во вкладке «Друзья».</p>
        <div className="ms-code">{shareCode}</div>
        <div className="btn-row">
          <Button onClick={() => { navigator.clipboard.writeText(shareCode ?? ''); toast('Код скопирован.', 'success') }}>
            Скопировать
          </Button>
          <Button variant="ghost" onClick={() => setShareCode(null)}>Закрыть</Button>
        </div>
      </Modal>

      <InstanceEditorModal instance={editing} onClose={() => setEditing(null)} onChanged={refresh} />
    </div>
  )
}