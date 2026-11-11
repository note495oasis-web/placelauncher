import { useEffect, useRef, useState } from 'react'
import { api, errText, formatBytes, formatDownloads } from '../lib'
import { useToast } from './toast'
import { Button, TextInput, Select, SectionTitle, Modal, Spinner, EmptyState } from './ui'

export default function ModpacksScreen(): JSX.Element {
  const toast = useToast()
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModProject[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<ModProject | null>(null)
  const [files, setFiles] = useState<ModFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const PAGE = 24

  async function search(): Promise<void> {
    setSearching(true)
    setSearched(true)
    setSelected(null)
    setHasMore(true)
    offsetRef.current = 0
    try {
      const page = await api.searchMods(source, query, { projectType: 'modpack', limit: PAGE, offset: 0 })
      setResults(page)
      offsetRef.current = page.length
      setHasMore(page.length >= PAGE)
    } catch (e) {
      toast(errText(e), 'error')
      setResults([])
      setHasMore(false)
    } finally {
      setSearching(false)
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMoreRef.current || !hasMore || searching || selected) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const page = await api.searchMods(source, query, { projectType: 'modpack', limit: PAGE, offset: offsetRef.current })
      setResults((prev) => [...prev, ...page])
      offsetRef.current += page.length
      if (page.length < PAGE) setHasMore(false)
    } catch (e) {
      toast(errText(e), 'error')
      setHasMore(false)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }

  function onGridScroll(e: React.UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) void loadMore()
  }

  useEffect(() => {
    search()
  }, [source])

  async function openProject(p: ModProject): Promise<void> {
    setSelected(p)
    setFiles([])
    setLoadingFiles(true)
    try {
      setFiles(await api.getModVersions(source, p.id, { projectType: 'modpack' }))
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setLoadingFiles(false)
    }
  }

  async function install(file: ModFile): Promise<void> {
    if (!selected) return
    if (!file.url) {
      toast('Автор запретил прямое скачивание этого файла.', 'error')
      return
    }
    setInstalling(file.id)
    setProgress(null)
    const off = api.onModpackProgress(setProgress)
    try {
      const res = await api.installModpack(source, file.url, selected.title)
      toast(
        `Сборка «${res.instance.displayName}» (${res.instance.versionId}) установлена — вкладка «Играть». ` +
          (res.skipped ? `Пропущено файлов: ${res.skipped}.` : ''),
        'success'
      )
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      off()
      setInstalling(null)
      setProgress(null)
    }
  }

  return (
    <div className="screen modpacks-screen">
      <SectionTitle>Модпаки</SectionTitle>

      <div className="card">
        <div className="search-row">
          <Select value={source} onChange={(e) => setSource(e.target.value as 'modrinth' | 'curseforge')}>
            <option value="modrinth">Modrinth</option>
            <option value="curseforge">CurseForge</option>
          </Select>
          <TextInput
            placeholder="Поиск модпаков…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <Button onClick={search} disabled={searching}>{searching ? 'Поиск…' : 'Найти'}</Button>
        </div>
        <p className="muted small">
          Готовые сборки со всеми модами: нажмите на модпак, выберите версию и «Установить» — готовый экземпляр
          появится во вкладке «Играть». Java и загрузчик скачаются автоматически при первом запуске.
        </p>
      </div>

      {searching ? (
        <Spinner label="Поиск модпаков…" />
      ) : results.length === 0 ? (
        searched ? <EmptyState title="Ничего не найдено" text="Попробуйте другой запрос." /> : null
      ) : (
        <div className="mod-grid" onScroll={onGridScroll}>
          {results.map((p) => (
            <div key={p.id} className="mod-card" onClick={() => openProject(p)}>
              {p.iconUrl ? <img className="mod-icon" src={p.iconUrl} alt="" /> : <div className="mod-icon mod-icon-fallback">▣</div>}
              <div className="mod-body">
                <strong>{p.title}</strong>
                <span className="muted small">{p.author} · {formatDownloads(p.downloads)}</span>
                <p className="mod-desc">{p.description}</p>
              </div>
            </div>
          ))}
          {loadingMore && (
            <div className="grid-footer"><Spinner label="Подгрузка ещё…" /></div>
          )}
          {!hasMore && !loadingMore && results.length > 0 && (
            <div className="grid-footer muted small">Это все результаты</div>
          )}
        </div>
      )}

      <Modal open={!!selected} title={selected?.title ?? ''} onClose={() => setSelected(null)} wide>
        {loadingFiles ? (
          <Spinner label="Загрузка списка версий…" />
        ) : files.length === 0 ? (
          <EmptyState title="Нет файлов" />
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <div key={f.id} className="file-row">
                <div className="account-meta">
                  <strong>{f.name}</strong>
                  <span className="muted small">
                    {f.filename} · {formatBytes(f.size)}{f.version ? ` · MC ${f.version}` : ''}
                  </span>
                </div>
                <Button variant="subtle" onClick={() => install(f)} disabled={installing !== null}>
                  {installing === f.id
                    ? progress
                      ? `Файлы ${progress.done}/${progress.total}`
                      : 'Установка…'
                    : 'Установить'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}