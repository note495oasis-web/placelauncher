import { useEffect, useState } from 'react'
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
  const toast = useToast()
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModProject[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<ModProject | null>(null)
  const [files, setFiles] = useState<ModFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  useEffect(() => {
    search()
  }, [source])

  function opts(): Record<string, unknown> {
    const o: Record<string, unknown> = { projectType, limit: 24 }
    if (gameVersion) o.gameVersion = gameVersion
    if (projectType === 'mod' && loader) o.loader = loader
    return o
  }

  async function search(): Promise<void> {
    setSearching(true)
    setSearched(true)
    setSelected(null)
    try {
      setResults(await api.searchMods(source, query, opts()))
    } catch (e) {
      toast(errText(e), 'error')
      setResults([])
    } finally {
      setSearching(false)
    }
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
        <div className="mod-grid">
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
        </div>
      )}
    </div>
  )
}