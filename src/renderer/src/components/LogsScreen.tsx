import { useEffect, useRef, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, SectionTitle, Select } from './ui'

type Filter = 'all' | 'info' | 'game' | 'warn' | 'error' | 'debug'

const MAX = 5000

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour12: false })
}

function formatLine(e: LogEntry): string {
  return `[${time(e.ts)}] [${e.level}] [${e.source}] ${e.message}`
}

export default function LogsScreen(): JSX.Element {
  const toast = useToast()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getLogs().then(setEntries).catch((e) => toast(errText(e), 'error'))
    const offAppend = api.onLog((entry) =>
      setEntries((prev) => {
        const next = prev.length >= MAX ? prev.slice(prev.length - MAX + 1) : prev.slice()
        next.push(entry)
        return next
      })
    )
    const offCleared = api.onLogsCleared(() => setEntries([]))
    return () => {
      offAppend()
      offCleared()
    }
  }, [])

  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [entries, autoScroll])

  const visible = filter === 'all' ? entries : entries.filter((e) => e.level === filter)

  async function copy(): Promise<void> {
    try {
      await api.copyText(visible.map(formatLine).join('\n'))
      toast('Логи скопированы.', 'success')
    } catch {
      toast('Не удалось скопировать логи.', 'error')
    }
  }

  async function save(): Promise<void> {
    try {
      const path = await api.saveLogs()
      if (path) toast(`Сохранено: ${path}`, 'success')
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function clear(): Promise<void> {
    try {
      await api.clearLogs()
      setEntries([])
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  return (
    <div className="screen logs-screen">
      <SectionTitle
        action={
          <div className="btn-row logs-actions">
            <Button variant="ghost" onClick={copy}>Копировать</Button>
            <Button variant="ghost" onClick={save}>Сохранить в файл</Button>
            <Button variant="danger" onClick={clear}>Очистить</Button>
          </div>
        }
      >
        Логи
      </SectionTitle>

      <div className="logs-toolbar">
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">Все ({entries.length})</option>
          <option value="info">Инфо</option>
          <option value="game">Игра</option>
          <option value="warn">Предупреждения</option>
          <option value="error">Ошибки</option>
          <option value="debug">Отладка</option>
        </Select>
        <label className="checkbox">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          Автопрокрутка
        </label>
        <span className="muted small">{visible.length} записей</span>
      </div>

      <div className="logs-box" ref={boxRef}>
        {visible.length === 0 ? (
          <div className="empty"><p>Пока нет логов.</p></div>
        ) : (
          visible.map((e, i) => (
            <div key={`${e.ts}-${i}`} className={`log-line log-${e.level}`}>
              <span className="log-time">{time(e.ts)}</span>
              <span className="log-level">{e.level}</span>
              <span className="log-source">{e.source}</span>
              <span className="log-msg">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}