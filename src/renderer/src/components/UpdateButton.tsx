import { useEffect, useState } from 'react'
import { api } from '../lib'
import { useToast } from './toast'

export default function UpdateButton({ compact }: { compact: boolean }): JSX.Element {
  const toast = useToast()
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    api.onUpdateStatus(setStatus)
    return () => api.offUpdateStatus()
  }, [])

  useEffect(() => {
    if (status.state === 'error') toast(`Обновление: ${status.message ?? 'ошибка'}`, 'error')
    if (status.state === 'dev') toast(status.message ?? 'Обновления только в установленной версии.', 'info')
    if (status.state === 'current') toast('Установлена последняя версия.', 'success')
  }, [status.state])

  function label(): string {
    switch (status.state) {
      case 'checking': return 'Проверка…'
      case 'available': return `Скачать v${status.version}`
      case 'downloading': return `${status.percent ?? 0}%`
      case 'ready': return 'Установить и перезапустить'
      case 'current': return 'Актуально'
      default: return 'Обновить'
    }
  }

  function click(): void {
    if (status.state === 'available') void api.downloadUpdate()
    else if (status.state === 'ready') void api.installUpdate()
    else if (status.state !== 'downloading' && status.state !== 'checking') void api.checkForUpdates()
  }

  const busy = status.state === 'downloading' || status.state === 'checking'

  return (
    <button
      className={`update-btn ${compact ? 'compact' : ''}`}
      onClick={click}
      disabled={busy}
      title={label()}
    >
      <span className="nav-icon">⟳</span>
      {!compact && <span className="nav-label">{label()}</span>}
    </button>
  )
}