import { useEffect, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Field, TextInput, Select, Modal, Badge, Progress } from './ui'
import ModPicker from './ModPicker'

interface SelectedMod {
  project: ModProject
  file: ModFile
  source: 'modrinth' | 'curseforge'
}

export default function CreateInstanceModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}): JSX.Element {
  const toast = useToast()
  const [versions, setVersions] = useState<{ id: string; type: string }[]>([])
  const [showAll, setShowAll] = useState(false)
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [loader, setLoader] = useState('none')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [selected, setSelected] = useState<SelectedMod[]>([])
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected([])
    setProgress(null)
    api.getSettings().then((s) => setShowAll(Boolean((s as Record<string, unknown>).showAllVersions)))
    api.listVersions()
      .then((r) => {
        setVersions(r.versions)
        setVersion(r.latest.release)
      })
      .catch((e) => toast(errText(e), 'error'))
  }, [open])

  const visibleVersions = showAll ? versions : versions.filter((v) => v.type === 'release')
  const withMods = loader !== 'none'

  function addMod(project: ModProject, file: ModFile, source: 'modrinth' | 'curseforge'): void {
    setSelected((prev) => (prev.some((m) => m.file.id === file.id) ? prev : [...prev, { project, file, source }]))
    toast(`Добавлено: ${project.title}`, 'success')
  }

  async function create(): Promise<void> {
    if (!name.trim() || !version) {
      toast('Укажите название и версию.', 'error')
      return
    }
    setCreating(true)
    try {
      const inst = await api.createInstance({
        name: name.trim(),
        versionId: version,
        loader: withMods ? { type: loader as InstanceLoader['type'], version: loaderVersion.trim() } : undefined
      })
      if (withMods && selected.length) {
        setProgress({ done: 0, total: selected.length })
        let done = 0
        for (const m of selected) {
          await api.installMod(inst.name, m.source, m.project.id, { url: m.file.url, filename: m.file.filename, size: m.file.size }, 'mods')
          setProgress({ done: ++done, total: selected.length })
        }
      }
      toast(`Экземпляр «${inst.displayName}» создан.`, 'success')
      setName('')
      setLoader('none')
      setLoaderVersion('')
      setSelected([])
      onCreated()
      onClose()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setCreating(false)
      setProgress(null)
    }
  }

  return (
    <Modal open={open} title="Создать экземпляр" onClose={onClose} wide>
      <div className="grid-2">
        <Field label="Название модпака / экземпляра">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Моя сборка" />
        </Field>
        <Field label="Версия Minecraft" hint={showAll ? 'Все версии: от alpha до последней' : 'Только релизы (все версии — в настройках)'}>
          <Select value={version} onChange={(e) => setVersion(e.target.value)}>
            {visibleVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}{showAll && v.type !== 'release' ? ` (${v.type})` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Установщик модов">
          <Select value={loader} onChange={(e) => setLoader(e.target.value)}>
            <option value="none">Vanilla (без модов)</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
            <option value="quilt">Quilt</option>
          </Select>
        </Field>
        <Field label="Версия загрузчика" hint="Пусто = последняя">
          <TextInput value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)} disabled={!withMods} />
        </Field>
      </div>

      {withMods && (
        <div className="create-mods">
          <div className="section-title">
            <h2>Добавить моды</h2>
            {selected.length > 0 && <Badge tone="accent">{selected.length} выбрано</Badge>}
          </div>
          {selected.length > 0 && (
            <div className="selected-chips">
              {selected.map((m) => (
                <span key={m.file.id} className="chip">
                  {m.project.title}
                  <button onClick={() => setSelected((prev) => prev.filter((x) => x.file.id !== m.file.id))}>×</button>
                </span>
              ))}
            </div>
          )}
          <ModPicker
            gameVersion={version}
            loader={loader}
            projectType="mod"
            actionLabel="Добавить"
            onPick={addMod}
          />
        </div>
      )}

      {progress && <Progress value={progress.done} max={progress.total} label="Установка модов" />}
      <div className="btn-row">
        <Button onClick={create} disabled={creating}>
          {creating ? 'Создание…' : withMods ? `Создать и установить (${selected.length})` : 'Создать экземпляр'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
      </div>
    </Modal>
  )
}