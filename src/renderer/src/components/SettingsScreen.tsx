import { useEffect, useRef, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Field, TextInput, Select, SectionTitle, Badge, Modal, Progress, Spinner } from './ui'

export interface ProxySettings {
  mode: 'off' | 'manual' | 'auto'
  type: 'socks5' | 'http'
  host: string
  port: number
  username?: string
  password?: string
}

export interface Settings {
  memoryMb: number
  javaPath: string
  gameDir: string
  proxy: ProxySettings
  curseforgeApiKey: string
  microsoftClientId: string
  backendUrl: string
  showAllVersions: boolean
}

type Account = LauncherAccount

export default function SettingsScreen(): JSX.Element {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [msPrompt, setMsPrompt] = useState<MsPrompt | null>(null)
  const [elyModal, setElyModal] = useState(false)
  const [elyServer, setElyServer] = useState('https://authserver.ely.by')
  const [elyUser, setElyUser] = useState('')
  const [elyPass, setElyPass] = useState('')
  const [offlineName, setOfflineName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const msCancelled = useRef(false)

  const [proxyResult, setProxyResult] = useState<string | null>(null)
  const [pool, setPool] = useState<{ count: number; active: string | null } | null>(null)
  const [javaInfo, setJavaInfo] = useState<{ path: string; major: number } | null>(null)
  const [javaMajor, setJavaMajor] = useState(21)
  const [javaProgress, setJavaProgress] = useState<{ received: number; total: number } | null>(null)

  useEffect(() => {
    api.getSettings().then((s) => setSettings(s as unknown as Settings)).catch((e) => toast(errText(e), 'error'))
    refreshAccounts()
    api.onJavaProgress((p) => setJavaProgress(p))
    return () => {
      api.offJavaProgress()
    }
  }, [])

  async function refreshAccounts(): Promise<void> {
    try {
      const list = await api.listAccounts()
      setAccounts(list)
      const active = await api.getActiveAccount()
      setActiveId(active?.id ?? null)
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  function patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function patchProxy<K extends keyof ProxySettings>(key: K, value: ProxySettings[K]): void {
    setSettings((prev) => (prev ? { ...prev, proxy: { ...prev.proxy, [key]: value } } : prev))
  }

  async function save(): Promise<void> {
    if (!settings) return
    setSaving(true)
    try {
      await api.setSettings(settings as unknown as Record<string, unknown>)
      toast('Настройки сохранены.', 'success')
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function loginMicrosoft(): Promise<void> {
    await save()
    setBusy('ms')
    setMsPrompt(null)
    msCancelled.current = false
    const off = api.onMsPrompt((p) => setMsPrompt(p))
    try {
      await api.loginMicrosoft()
      toast('Аккаунт Microsoft добавлен.', 'success')
      await refreshAccounts()
    } catch (e) {
      if (!msCancelled.current) toast(errText(e), 'error')
    } finally {
      off()
      setBusy(null)
      setMsPrompt(null)
    }
  }

  function cancelMicrosoft(): void {
    msCancelled.current = true
    void api.cancelMicrosoft()
    setMsPrompt(null)
  }

  async function copyCode(): Promise<void> {
    if (!msPrompt) return
    try {
      await api.copyText(msPrompt.userCode)
      toast('Код скопирован.', 'success')
    } catch {
      toast('Не удалось скопировать код.', 'error')
    }
  }

  async function loginEly(): Promise<void> {
    setBusy('ely')
    try {
      await api.loginAuthlib(elyServer, elyUser, elyPass)
      toast('Аккаунт ely.by добавлен.', 'success')
      setElyModal(false)
      setElyPass('')
      await refreshAccounts()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function addOffline(): Promise<void> {
    if (!offlineName.trim()) return
    setBusy('offline')
    try {
      await api.addOfflineAccount(offlineName.trim())
      setOfflineName('')
      await refreshAccounts()
      toast('Оффлайн-аккаунт добавлен.', 'success')
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function testProxy(): Promise<void> {
    if (!settings) return
    setProxyResult('Проверка…')
    try {
      const r = await api.testProxy(settings.proxy as unknown as Record<string, unknown>)
      setProxyResult(r.ok ? `Работает: HTTP ${r.status}, ${r.latency} мс` : `Не работает (HTTP ${r.status})`)
    } catch (e) {
      setProxyResult(errText(e))
    }
  }

  async function refreshPool(): Promise<void> {
    setPool(null)
    setProxyResult('Обновление пула прокси…')
    try {
      const r = await api.refreshProxyPool()
      setPool({ count: r.count, active: r.active })
      setProxyResult(`Найдено рабочих прокси: ${r.count}`)
    } catch (e) {
      setProxyResult(errText(e))
    }
  }

  async function findJava(): Promise<void> {
    setBusy('javaFind')
    try {
      const info = await api.findJava()
      setJavaInfo(info)
      if (info) {
        patch('javaPath', info.path)
        toast(`Найдена Java ${info.major}: ${info.path}`, 'success')
      } else {
        toast('Java не найдена. Скачайте её ниже.', 'info')
      }
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function downloadJava(): Promise<void> {
    setBusy('javaDownload')
    setJavaProgress({ received: 0, total: 0 })
    try {
      const info = await api.downloadJava(javaMajor)
      setJavaInfo(info)
      patch('javaPath', info.path)
      toast(`Java ${info.major} загружена.`, 'success')
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(null)
      setJavaProgress(null)
    }
  }

  if (!settings) return <Spinner label="Загрузка настроек…" />

  return (
    <div className="screen settings-screen">
      <SectionTitle action={<Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>}>
        Настройки
      </SectionTitle>

      <div className="card">
        <h3>Аккаунты</h3>
        <div className="account-list">
          {accounts.length === 0 && <p className="muted">Нет аккаунтов. Добавьте Microsoft, ely.by или оффлайн.</p>}
          {accounts.map((a) => (
            <div key={a.id} className={`account-row ${activeId === a.id ? 'active' : ''}`}>
              <div className="account-meta">
                <strong>{a.username}</strong>
                <span className="muted">{a.type === 'microsoft' ? 'Microsoft' : a.type === 'authlib' ? 'ely.by / authlib' : 'оффлайн'}</span>
              </div>
              {activeId === a.id ? (
                <Badge tone="green">активен</Badge>
              ) : (
                <Button variant="subtle" onClick={() => api.setActiveAccount(a.id).then(refreshAccounts)}>
                  Выбрать
                </Button>
              )}
              <Button variant="ghost" onClick={() => api.removeAccount(a.id).then(refreshAccounts)}>
                Удалить
              </Button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <Button onClick={loginMicrosoft} disabled={busy === 'ms'}>
            {busy === 'ms' ? 'Ожидание входа…' : 'Войти через Microsoft'}
          </Button>
          <Button variant="subtle" onClick={() => setElyModal(true)}>Войти через ely.by</Button>
        </div>
        <div className="inline-form">
          <TextInput placeholder="Ник для оффлайн-режима" value={offlineName} onChange={(e) => setOfflineName(e.target.value)} />
          <Button variant="subtle" onClick={addOffline} disabled={busy === 'offline'}>Добавить оффлайн</Button>
        </div>
      </div>

      <div className="card">
        <h3>Прокси</h3>
        <p className="muted">Нужен для доступа к Modrinth и CurseForge без VPN. Авто-режим сам подбирает рабочие прокси.</p>
        <div className="grid-2">
          <Field label="Режим">
            <Select value={settings.proxy.mode} onChange={(e) => patchProxy('mode', e.target.value as ProxySettings['mode'])}>
              <option value="off">Выключен</option>
              <option value="manual">Вручную</option>
              <option value="auto">Авто (публичный пул)</option>
            </Select>
          </Field>
          <Field label="Тип">
            <Select value={settings.proxy.type} onChange={(e) => patchProxy('type', e.target.value as ProxySettings['type'])}>
              <option value="socks5">SOCKS5</option>
              <option value="http">HTTP</option>
            </Select>
          </Field>
        </div>
        {settings.proxy.mode === 'manual' && (
          <>
            <div className="grid-2">
              <Field label="Хост">
                <TextInput value={settings.proxy.host} onChange={(e) => patchProxy('host', e.target.value)} placeholder="1.2.3.4" />
              </Field>
              <Field label="Порт">
                <TextInput type="number" value={settings.proxy.port} onChange={(e) => patchProxy('port', Number(e.target.value))} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Логин (необязательно)">
                <TextInput value={settings.proxy.username ?? ''} onChange={(e) => patchProxy('username', e.target.value)} />
              </Field>
              <Field label="Пароль (необязательно)">
                <TextInput type="password" value={settings.proxy.password ?? ''} onChange={(e) => patchProxy('password', e.target.value)} />
              </Field>
            </div>
          </>
        )}
        <div className="btn-row">
          <Button variant="subtle" onClick={testProxy}>Проверить</Button>
          {settings.proxy.mode === 'auto' && <Button variant="subtle" onClick={refreshPool}>Обновить пул</Button>}
          {proxyResult && <span className="muted">{proxyResult}</span>}
          {pool && <Badge tone="accent">{pool.count} прокси · {pool.active ?? '—'}</Badge>}
        </div>
      </div>

      <div className="card">
        <h3>Java и производительность</h3>
        <p className="muted">Java скачивается и устанавливается автоматически при запуске игры — вручную ставить ничего не нужно. Кнопки ниже — для ручного выбора.</p>
        <div className="grid-2">
          <Field label="Память (МБ)">
            <TextInput type="number" value={settings.memoryMb} onChange={(e) => patch('memoryMb', Number(e.target.value))} />
          </Field>
          <Field label="Версия Java для загрузки">
            <Select value={javaMajor} onChange={(e) => setJavaMajor(Number(e.target.value))}>
              <option value={8}>Java 8</option>
              <option value={17}>Java 17</option>
              <option value={21}>Java 21</option>
              <option value={25}>Java 25</option>
            </Select>
          </Field>
        </div>
        <Field label="Путь к Java (пусто = авто)" hint={javaInfo ? `Обнаружена: Java ${javaInfo.major}` : undefined}>
          <TextInput value={settings.javaPath} onChange={(e) => patch('javaPath', e.target.value)} placeholder="C:\\...\\java.exe" />
        </Field>
        <div className="btn-row">
          <Button variant="subtle" onClick={findJava} disabled={busy === 'javaFind'}>Найти Java</Button>
          <Button variant="subtle" onClick={downloadJava} disabled={busy === 'javaDownload'}>
            {busy === 'javaDownload' ? 'Загрузка…' : `Скачать Java ${javaMajor}`}
          </Button>
        </div>
        {javaProgress && <Progress value={javaProgress.received} max={javaProgress.total || 1} label="Загрузка Java" />}
      </div>

      <div className="card">
        <h3>Пути и интеграции</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.showAllVersions}
            onChange={(e) => patch('showAllVersions', e.target.checked)}
          />
          Показывать все версии Minecraft (от alpha до последней) при создании экземпляра
        </label>
        <Field label="Папка игры (пусто = внутри лаунчера)">
          <TextInput value={settings.gameDir} onChange={(e) => patch('gameDir', e.target.value)} />
        </Field>
        <Field label="Адрес сервера друзей (backend)" hint="Например https://aurora-friends.onrender.com">
          <TextInput value={settings.backendUrl} onChange={(e) => patch('backendUrl', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Microsoft Client ID" hint="Пусто = встроенный публичный ID; можно указать свой (Azure App Registration)">
          <TextInput value={settings.microsoftClientId} onChange={(e) => patch('microsoftClientId', e.target.value)} />
        </Field>
        <Field label="CurseForge API Key" hint="Нужен для поиска модов в CurseForge">
          <TextInput type="password" value={settings.curseforgeApiKey} onChange={(e) => patch('curseforgeApiKey', e.target.value)} />
        </Field>
      </div>

      <Modal open={!!msPrompt} title="Вход Microsoft" onClose={cancelMicrosoft} locked confirmClose>
        {msPrompt && (
          <div className="ms-prompt">
            <p>Страница входа Microsoft открыта в браузере — вставьте код на сайте и подтвердите вход.</p>
            <div className="ms-code">{msPrompt.userCode}</div>
            <div className="btn-row">
              <Button onClick={copyCode}>Скопировать код</Button>
              <Button variant="subtle" onClick={() => window.open(msPrompt.verificationUri, '_blank')}>
                Открыть страницу входа ещё раз
              </Button>
            </div>
            <p className="muted">Ожидание подтверждения… Окно закроется само после входа.</p>
          </div>
        )}
      </Modal>

      <Modal open={elyModal} title="Вход через ely.by" onClose={() => setElyModal(false)}>
        <Field label="Сервер авторизации">
          <TextInput value={elyServer} onChange={(e) => setElyServer(e.target.value)} />
        </Field>
        <Field label="Логин / email">
          <TextInput value={elyUser} onChange={(e) => setElyUser(e.target.value)} />
        </Field>
        <Field label="Пароль">
          <TextInput type="password" value={elyPass} onChange={(e) => setElyPass(e.target.value)} />
        </Field>
        <div className="btn-row">
          <Button onClick={loginEly} disabled={busy === 'ely'}>{busy === 'ely' ? 'Вход…' : 'Войти'}</Button>
          <Button variant="ghost" onClick={() => setElyModal(false)}>Отмена</Button>
        </div>
      </Modal>
    </div>
  )
}