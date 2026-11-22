import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Modal, Badge, EmptyState, Field, TextInput } from './ui'
import { IconFolder, IconImage, IconRefresh } from './Icons'
import ModPicker from './ModPicker'

const contentTabs = [
  { id: 'mods', label: 'Моды', type: 'mod' },
  { id: 'resourcepacks', label: 'Ресурспаки', type: 'resourcepack' },
  { id: 'shaderpacks', label: 'Шейдеры', type: 'shader' }
] as const

type ContentTab = (typeof contentTabs)[number]['id']
type TabId = ContentTab | 'worlds' | 'screenshots' | 'backups' | 'settings'

const allTabs: { id: TabId; label: string }[] = [
  ...contentTabs.map((t) => ({ id: t.id as TabId, label: t.label })),
  { id: 'worlds', label: 'Миры' },
  { id: 'screenshots', label: 'Скриншоты' },
  { id: 'backups', label: 'Бэкапы' },
  { id: 'settings', label: 'Настройки' }
]

const hues = [85, 100, 115, 130, 145, 160, 172]

function hueStyle(h: number): CSSProperties {
  return { background: `linear-gradient(135deg, hsl(${h} 55% 26%), hsl(${h + 30} 65% 12%))` }
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InstanceEditorModal({
  instance,
  onClose,
  onChanged
}: {
  instance: LauncherInstance | null
  onClose: () => void
  onChanged: () => void
}): JSX.Element {
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('mods')
  const [installed, setInstalled] = useState<string[]>([])
  const [worlds, setWorlds] = useState<WorldEntry[]>([])
  const [shots, setShots] = useState<ScreenshotEntry[]>([])
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [memoryMb, setMemoryMb] = useState(4096)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [javaArgs, setJavaArgs] = useState('')
  const [coverHue, setCoverHue] = useState<number | undefined>(undefined)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const active = contentTabs.find((t) => t.id === tab)

  useEffect(() => {
    if (!instance) return
    setTab('mods')
    refresh('mods')
  }, [instance?.name])

  async function refresh(subdir: string): Promise<void> {
    if (!instance) return
    try {
      setInstalled(await api.listContent(instance.name, subdir))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function loadWorlds(): Promise<void> {
    if (!instance) return
    try {
      setWorlds(await api.listWorlds(instance.name))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function loadShots(): Promise<void> {
    if (!instance) return
    try {
      setShots(await api.listScreenshots(instance.name))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function loadBackups(): Promise<void> {
    if (!instance) return
    try {
      setBackups(await api.listBackups(instance.name))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function makeBackup(): Promise<void> {
    if (!instance) return
    setBackupBusy(true)
    try {
      setBackups(await api.createBackup(instance.name, 'ручной бэкап'))
      toast('Бэкап сделан.', 'success')
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBackupBusy(false)
    }
  }

  async function restoreB(b: BackupEntry): Promise<void> {
    if (!instance) return
    if (!window.confirm(`Вернуть сборку к бэкапу «${b.label}»? Текущие моды и конфиги заменятся (перед этим тоже сохранится бэкап).`)) return
    setBackupBusy(true)
    try {
      setBackups(await api.restoreBackup(instance.name, b.id))
      toast('Сборка возвращена к бэкапу.', 'success')
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBackupBusy(false)
    }
  }

  async function deleteB(b: BackupEntry): Promise<void> {
    if (!instance) return
    if (!window.confirm(`Удалить бэкап «${b.label}»?`)) return
    setBackupBusy(true)
    try {
      setBackups(await api.deleteBackup(instance.name, b.id))
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBackupBusy(false)
    }
  }

  async function loadSettings(): Promise<void> {
    if (!instance) return
    setMemoryMb(instance.memoryMb ?? 4096)
    setWidth(instance.width ? String(instance.width) : '')
    setHeight(instance.height ? String(instance.height) : '')
    setJavaArgs(instance.javaArgs ?? '')
    setCoverHue(instance.coverHue)
    try {
      setCoverUrl(await api.getCover(instance.name))
    } catch {
      setCoverUrl(null)
    }
  }

  function switchTab(id: TabId): void {
    setTab(id)
    if (id === 'worlds') void loadWorlds()
    else if (id === 'screenshots') void loadShots()
    else if (id === 'backups') void loadBackups()
    else if (id === 'settings') void loadSettings()
    else void refresh(id)
  }

  async function install(project: ModProject, file: ModFile, source: 'modrinth' | 'curseforge'): Promise<void> {
    if (!instance || !active) return
    setBusyId(file.id)
    try {
      await api.installMod(instance.name, source, project.id, { url: file.url, filename: file.filename, size: file.size }, tab)
      toast(`Установлено: ${file.filename}`, 'success')
      await refresh(tab)
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(filename: string): Promise<void> {
    if (!instance || !active) return
    try {
      setInstalled(await api.removeContent(instance.name, tab, filename))
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function saveSettings(): Promise<void> {
    if (!instance) return
    setSaving(true)
    try {
      const w = parseInt(width, 10)
      const h = parseInt(height, 10)
      await api.updateInstance(instance.name, {
        memoryMb,
        width: Number.isFinite(w) && w > 0 ? w : undefined,
        height: Number.isFinite(h) && h > 0 ? h : undefined,
        javaArgs: javaArgs.trim() || undefined,
        coverHue
      })
      toast('Настройки экземпляра сохранены.', 'success')
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  function pickCoverFile(file: File): void {
    if (!instance) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        setCoverUrl(await api.setCover(instance.name, String(reader.result)))
        toast('Обложка обновлена.', 'success')
        onChanged()
      } catch (e) {
        toast(errText(e), 'error')
      }
    }
    reader.readAsDataURL(file)
  }

  async function resetCover(): Promise<void> {
    if (!instance) return
    try {
      setCoverUrl(await api.setCover(instance.name, null))
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  return (
    <Modal open={!!instance} title={`Редактировать: ${instance?.displayName ?? ''}`} onClose={onClose} wide>
      {instance && (
        <>
          <div className="editor-tabs">
            {allTabs.map((t) => (
              <button key={t.id} className={`editor-tab ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
                {t.label}
              </button>
            ))}
            <Badge tone="accent">{instance.versionId}</Badge>
          </div>

          {active && (
            <>
              <div className="installed-block">
                <h3>Установлено ({installed.length})</h3>
                {installed.length === 0 ? (
                  <p className="muted small">Пока пусто.</p>
                ) : (
                  <div className="installed-list">
                    {installed.map((f) => (
                      <div key={f} className="installed-row">
                        <span className="installed-name">{f}</span>
                        <Button variant="ghost" onClick={() => remove(f)}>Удалить</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="section-title"><h2>Добавить ещё</h2></div>
              <ModPicker
                gameVersion={instance.versionId}
                loader={tab === 'mods' ? instance.loader?.type : undefined}
                projectType={active.type}
                actionLabel="Установить"
                busyId={busyId}
                onPick={install}
              />
            </>
          )}

          {tab === 'worlds' && (
            <>
              <div className="picker-head">
                <h3 className="grid-head-title">Миры ({worlds.length})</h3>
                <Button variant="ghost" onClick={loadWorlds}><span className="btn-ic"><IconRefresh size={14} /></span>Обновить</Button>
              </div>
              {worlds.length === 0 ? (
                <EmptyState title="Миров пока нет" text="Запустите игру и создайте мир — он появится здесь." />
              ) : (
                <div className="file-list">
                  {worlds.map((w) => (
                    <div key={w.name} className="file-row">
                      <div className="account-meta">
                        <strong>{w.name}</strong>
                        <span className="muted small">{w.sizeMb} МБ · изменён {fmtDate(w.modified)}</span>
                      </div>
                      <Button variant="ghost" onClick={() => api.openInstanceFile(instance.name, `saves/${w.name}`)}>
                        <span className="btn-ic"><IconFolder size={14} /></span>Папка
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'screenshots' && (
            <>
              <div className="picker-head">
                <h3 className="grid-head-title">Скриншоты ({shots.length})</h3>
                <Button variant="ghost" onClick={loadShots}><span className="btn-ic"><IconRefresh size={14} /></span>Обновить</Button>
              </div>
              {shots.length === 0 ? (
                <EmptyState title="Скриншотов пока нет" text="Нажмите F2 в игре — снимки появятся здесь." />
              ) : (
                <div className="shot-grid">
                  {shots.map((s) => (
                    <button
                      key={s.name}
                      className="shot"
                      title={`${s.name} — открыть`}
                      onClick={() => api.openInstanceFile(instance.name, `screenshots/${s.name}`)}
                    >
                      <img src={s.thumb} alt={s.name} />
                      <span className="shot-name">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'backups' && (
            <>
              <div className="picker-head">
                <h3 className="grid-head-title">Бэкапы ({backups.length})</h3>
                <Button variant="ghost" onClick={makeBackup} disabled={backupBusy}>Сделать сейчас</Button>
              </div>
              <p className="muted small">
                Перед каждой установкой или удалением мода лаунчер сам сохраняет снапшот папок mods, config,
                ресурспаков и шейдеров (держит 10 последних). Миры в бэкап не входят.
              </p>
              {backups.length === 0 ? (
                <EmptyState
                  title="Бэкапов пока нет"
                  text="Они появятся сами перед установкой модов — или нажми «Сделать сейчас»."
                />
              ) : (
                <div className="file-list">
                  {backups.map((b) => (
                    <div key={b.id} className="file-row">
                      <div className="account-meta">
                        <strong>{new Date(b.ts).toLocaleString('ru-RU')}</strong>
                        <span className="muted small">{b.label}{b.auto ? ' · авто' : ''}</span>
                      </div>
                      <div className="btn-row">
                        <Button variant="ghost" disabled={backupBusy} onClick={() => restoreB(b)}>Вернуть</Button>
                        <Button variant="danger" disabled={backupBusy} onClick={() => deleteB(b)}>Удалить</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'settings' && (
            <>
              <Field label={`Память: ${(memoryMb / 1024).toFixed(1)} ГБ`} hint="Сколько оперативной памяти выделить игре">
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(Number(e.target.value))}
                  className="range"
                />
              </Field>
              <div className="grid-2">
                <Field label="Ширина окна" hint="Пусто = как в прошлый раз">
                  <TextInput type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="854" />
                </Field>
                <Field label="Высота окна" hint="Пусто = как в прошлый раз">
                  <TextInput type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="480" />
                </Field>
              </div>
              <Field label="Дополнительные аргументы JVM" hint="Например -XX:+UseG1GC -XX:+ParallelRefProcEnabled">
                <TextInput value={javaArgs} onChange={(e) => setJavaArgs(e.target.value)} placeholder="-XX:+UseG1GC" />
              </Field>

              <Field label="Обложка экземпляра" hint="Своя картинка или цвет градиента">
                <div className="cover-row">
                  {coverUrl ? (
                    <img className="cover-preview" src={coverUrl} alt="Обложка" />
                  ) : (
                    <div className="cover-preview" style={coverHue !== undefined ? hueStyle(coverHue) : hueStyle(140)} />
                  )}
                  <div className="cover-controls">
                    <div className="cover-hues">
                      <button
                        className={`cover-hue auto ${coverHue === undefined && !coverUrl ? 'active' : ''}`}
                        title="Авто (по имени)"
                        onClick={() => setCoverHue(undefined)}
                      >
                        А
                      </button>
                      {hues.map((h) => (
                        <button
                          key={h}
                          className={`cover-hue ${coverHue === h && !coverUrl ? 'active' : ''}`}
                          style={hueStyle(h)}
                          title={`Градиент ${h}`}
                          onClick={() => setCoverHue(h)}
                        />
                      ))}
                    </div>
                    <div className="btn-row">
                      <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                        <span className="btn-ic"><IconImage size={14} /></span>Загрузить картинку
                      </Button>
                      {coverUrl && <Button variant="ghost" onClick={resetCover}>Убрать картинку</Button>}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) pickCoverFile(f)
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              </Field>

              <div className="btn-row">
                <Button onClick={saveSettings} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}