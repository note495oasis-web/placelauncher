import { useEffect, useRef, useState } from 'react'
import { api, errText, formatBytes, formatDownloads } from '../lib'
import { useToast } from './toast'
import { Button, TextInput, Select, Spinner, EmptyState } from './ui'

export interface ModPickerProps {
  gameVersion?: string
  loader?: string
  projectType: string
  actionLabel?: string
  busyId?: string | null
  onPick: (project: ModProject, file: ModFile, source: 'modrinth' | 'curseforge') => void
}

export default function ModPicker({
  gameVersion,
  loader,
  projectType,
  actionLabel = 'Установить',
  busyId,
  onPick
}: ModPickerProps): JSX.Element {
  const PAGE = 24
  const toast = useToast()
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModProject[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<ModProject | null>(null)
  const [files, setFiles] = useState<ModFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, projectType, gameVersion, loader])

  function opts(): Record<string, unknown> {
    const o: Record<string, unknown> = { projectType, limit: PAGE }
    if (gameVersion) o.gameVersion = gameVersion
    if (projectType === 'mod' && loader) o.loader = loader
    return o
  }

  async function search(): Promise<void> {
    setSearching(true)
    setSearched(true)
    setSelected(null)
    setHasMore(true)
    offsetRef.current = 0
    try {
      const page = await api.searchMods(source, query, { ...opts(), offset: 0 })
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
      const page = await api.searchMods(source, query, { ...opts(), offset: offsetRef.current })
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

  async function openProject(p: ModProject): Promise<void> {
    setSelected(p)
    setFiles([])
    setLoadingFiles(true)
    try {
      setFiles(await api.getModVersions(source, p.id, opts()))
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setLoadingFiles(false)
    }
  }

  return (
    <div className="mod-picker">
      <div className="search-row">
        <Select value={source} onChange={(e) => setSource(e.target.value as 'modrinth' | 'curseforge')}>
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </Select>
        <TextInput
          placeholder="Поиск модов…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Button onClick={search} disabled={searching}>{searching ? 'Поиск…' : 'Найти'}</Button>
      </div>

      {selected ? (
        <div>
          <div className="picker-head">
            <Button variant="ghost" onClick={() => setSelected(null)}>← Назад к результатам</Button>
            <strong>{selected.title}</strong>
          </div>
          {loadingFiles ? (
            <Spinner label="Список файлов…" />
          ) : files.length === 0 ? (
            <EmptyState title="Нет файлов под эту версию" />
          ) : (
            <div className="file-list">
              {files.map((f) => (
                <div key={f.id} className="file-row">
                  <div className="account-meta">
                    <strong>{f.name}</strong>
                    <span className="muted small">{f.filename} · {formatBytes(f.size)}</span>
                  </div>
                  <Button variant="subtle" disabled={busyId === f.id || !f.url} onClick={() => onPick(selected, f, source)}>
                    {busyId === f.id ? '…' : actionLabel}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : searching ? (
        <Spinner label="Поиск через прокси…" />
      ) : results.length === 0 ? (
        searched ? <EmptyState title="Ничего не найдено" /> : <p className="muted small">Введите запрос и нажмите «Найти».</p>
      ) : (
        <div className="mod-grid" onScroll={onGridScroll}>
          {results.map((p) => (
            <div key={p.id} className="mod-card" onClick={() => openProject(p)}>
              {p.iconUrl ? <img className="mod-icon" src={p.iconUrl} alt="" /> : <div className="mod-icon mod-icon-fallback">▦</div>}
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
    </div>
  )
}