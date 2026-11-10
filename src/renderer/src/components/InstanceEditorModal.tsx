import { useEffect, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Modal, Badge, EmptyState } from './ui'
import ModPicker from './ModPicker'

const tabs = [
  { id: 'mods', label: 'Моды', type: 'mod' },
  { id: 'resourcepacks', label: 'Ресурспаки', type: 'resourcepack' },
  { id: 'shaderpacks', label: 'Шейдеры', type: 'shader' }
] as const

type TabId = (typeof tabs)[number]['id']

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
  const [busyId, setBusyId] = useState<string | null>(null)

  const active = tabs.find((t) => t.id === tab)!

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

  function switchTab(id: TabId): void {
    setTab(id)
    refresh(id)
  }

  async function install(project: ModProject, file: ModFile, source: 'modrinth' | 'curseforge'): Promise<void> {
    if (!instance) return
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
    if (!instance) return
    try {
      setInstalled(await api.removeContent(instance.name, tab, filename))
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
            {tabs.map((t) => (
              <button key={t.id} className={`editor-tab ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
                {t.label}
              </button>
            ))}
            <Badge tone="accent">{instance.versionId}</Badge>
          </div>

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
    </Modal>
  )
}