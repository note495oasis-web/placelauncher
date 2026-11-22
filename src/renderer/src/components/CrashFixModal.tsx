import { useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Modal, Badge } from './ui'

type FixState = 'idle' | 'busy' | 'done' | 'error'

export default function CrashFixModal({
  instance,
  analysis,
  onClose,
  onRelaunch
}: {
  instance: LauncherInstance
  analysis: CrashAnalysis
  onClose: () => void
  onRelaunch: () => void
}): JSX.Element {
  const toast = useToast()
  const [states, setStates] = useState<Record<number, FixState>>({})
  const [msgs, setMsgs] = useState<Record<number, string>>({})
  const anyDone = Object.values(states).includes('done')
  const anyBusy = Object.values(states).includes('busy')

  async function runFix(i: number, fix: CrashFix): Promise<void> {
    setStates((s) => ({ ...s, [i]: 'busy' }))
    try {
      const msg = await api.applyCrashFix(instance.name, fix)
      setMsgs((m) => ({ ...m, [i]: msg }))
      setStates((s) => ({ ...s, [i]: 'done' }))
      toast(msg, 'success')
    } catch (e) {
      const msg = errText(e)
      setMsgs((m) => ({ ...m, [i]: msg }))
      setStates((s) => ({ ...s, [i]: 'error' }))
      toast(msg, 'error')
    }
  }

  async function fixAll(): Promise<void> {
    for (let i = 0; i < analysis.fixes.length; i++) {
      if (states[i] === 'done') continue
      await runFix(i, analysis.fixes[i])
    }
  }

  return (
    <Modal open title="Сборка упала" onClose={onClose}>
      <p>{analysis.summary}</p>
      {analysis.errorLine && <div className="crash-line">{analysis.errorLine}</div>}
      {analysis.fixes.length > 0 ? (
        <>
          <div className="picker-head">
            <h3 className="grid-head-title">Что можно сделать</h3>
            {analysis.fixes.length > 1 && !anyDone && (
              <Button onClick={fixAll} disabled={anyBusy}>{anyBusy ? 'Чиню…' : 'Пофиксить всё'}</Button>
            )}
          </div>
          <div className="fix-list">
            {analysis.fixes.map((fix, i) => (
              <div key={i} className="fix-row">
                <div className="account-meta">
                  <strong>{fix.label}</strong>
                  {msgs[i] && <span className={`muted small ${states[i] === 'error' ? 'fix-error' : ''}`}>{msgs[i]}</span>}
                </div>
                {states[i] === 'done' ? (
                  <Badge tone="green">Готово</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={anyBusy}
                    onClick={() => runFix(i, fix)}
                  >
                    {states[i] === 'busy' ? 'Делаю…' : 'Сделать'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted small">Автоматический фикс не придумал. Загляни в полный лог на вкладке «Логи» или откатись в редакторе сборки на вкладке «Бэкапы».</p>
      )}
      <div className="btn-row">
        {anyDone && (
          <Button onClick={() => { onClose(); onRelaunch() }}>Запустить снова</Button>
        )}
        {analysis.reportRel && (
          <Button variant="subtle" onClick={() => void api.openInstanceFile(instance.name, analysis.reportRel!)}>
            Открыть отчёт
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Закрыть</Button>
      </div>
    </Modal>
  )
}
