import { useEffect, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Field, TextInput, Select, SectionTitle, Badge, Modal, Progress, Spinner, EmptyState } from './ui'

export default function FriendsScreen(): JSX.Element {
  const toast = useToast()
  const [identity, setIdentity] = useState<FriendIdentity | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [registerName, setRegisterName] = useState('')
  const [registering, setRegistering] = useState(false)

  const [friends, setFriends] = useState<FriendInfo[]>([])
  const [worlds, setWorlds] = useState<Record<string, WorldInfo>>({})
  const [connected, setConnected] = useState(false)
  const [addCode, setAddCode] = useState('')

  const [joinInfo, setJoinInfo] = useState<{ localPort: number } | null>(null)
  const [joining, setJoining] = useState<string | null>(null)

  const [importCode, setImportCode] = useState('')
  const [importName, setImportName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

  const [instances, setInstances] = useState<LauncherInstance[]>([])
  const [shareTarget, setShareTarget] = useState('')
  const [shareCode, setShareCode] = useState<string | null>(null)

  useEffect(() => {
    api.getFriendIdentity().then((id) => {
      setIdentity(id)
      setLoaded(true)
      if (id) {
        api.connectFriends()
        api.listFriends().then(setFriends).catch(() => {})
        api.getWorlds().then((ws) => {
          const map: Record<string, WorldInfo> = {}
          for (const w of ws) map[w.userId] = w
          setWorlds(map)
        })
      }
    })
    api.listInstances().then((list) => {
      setInstances(list)
      if (list.length) setShareTarget(list[0].name)
    }).catch(() => {})

    api.onFriendsList((list) => setFriends(list))
    api.onPresence((p) => {
      setFriends((prev) => prev.map((f) => (f.userId === p.userId ? { ...f, ...p } : f)))
    })
    api.onWorld((w) => {
      setWorlds((prev) => {
        const next = { ...prev }
        if (w.hosting) next[w.userId] = w
        else delete next[w.userId]
        return next
      })
    })
    api.onFriendsConnection((c) => setConnected(c.connected))
    api.onFriendsSessionExpired(() => {
      setIdentity(null)
      setFriends([])
      setWorlds({})
      setConnected(false)
      toast('Сессия друзей устарела — сервер перезапустился. Создайте профиль заново.', 'error')
    })
    api.onJoined((info) => setJoinInfo(info))
    api.onModpackProgress((p) => setImportProgress(p))
    return () => {
      api.offFriendsEvents()
      api.offModpackProgress()
    }
  }, [])

  async function register(): Promise<void> {
    if (!registerName.trim()) return
    setRegistering(true)
    try {
      const id = await api.registerFriend(registerName.trim())
      setIdentity(id)
      setFriends(await api.listFriends())
      toast('Профиль друзей создан.', 'success')
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setRegistering(false)
    }
  }

  async function addFriend(): Promise<void> {
    if (!addCode.trim()) return
    try {
      setFriends(await api.addFriend(addCode.trim().toUpperCase()))
      setAddCode('')
      toast('Друг добавлен.', 'success')
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function removeFriend(userId: string): Promise<void> {
    try {
      setFriends(await api.removeFriend(userId))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function join(friend: FriendInfo): Promise<void> {
    const world = worlds[friend.userId]
    if (!world) return
    setJoining(friend.userId)
    try {
      const info = await api.joinWorld(world.session)
      setJoinInfo(info)
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setJoining(null)
    }
  }

  async function importModpack(): Promise<void> {
    if (!importCode.trim() || !importName.trim()) {
      toast('Укажите код сборки и название.', 'error')
      return
    }
    setImporting(true)
    setImportProgress({ done: 0, total: 1 })
    try {
      await api.importSharedModpack(importCode.trim().toUpperCase(), importName.trim())
      toast('Сборка друга загружена.', 'success')
      setImportCode('')
      setImportName('')
      setInstances(await api.listInstances())
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  async function share(): Promise<void> {
    if (!shareTarget) return
    try {
      setShareCode(await api.shareInstance(shareTarget))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  if (!loaded) return <Spinner label="Загрузка…" />

  if (!identity) {
    return (
      <div className="screen friends-screen">
        <SectionTitle>Друзья</SectionTitle>
        <div className="card narrow">
          <h3>Создайте профиль</h3>
          <p className="muted">
            Профиль хранится на сервере друзей. Убедитесь, что адрес сервера указан в настройках
            (например https://ваш-сервер.onrender.com).
          </p>
          <Field label="Ваш ник" hint="3-24 символа: латиница, цифры, _">
            <TextInput value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Steve" />
          </Field>
          <Button onClick={register} disabled={registering}>{registering ? 'Создание…' : 'Создать профиль'}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen friends-screen">
      <SectionTitle action={<Badge tone={connected ? 'green' : 'warn'}>{connected ? 'онлайн' : 'нет связи'}</Badge>}>
        Друзья
      </SectionTitle>

      <div className="card">
        <div className="friend-code-row">
          <div>
            <span className="muted small">Ваш код друга</span>
            <div className="friend-code">{identity.friendCode}</div>
          </div>
          <Button
            variant="subtle"
            onClick={() => {
              api.copyText(identity.friendCode).then(
                () => toast('Код скопирован.', 'success'),
                () => toast('Не удалось скопировать код.', 'error')
              )
            }}
          >
            Скопировать
          </Button>
          <span className="muted small">Вы: {identity.username}</span>
        </div>
        <div className="inline-form">
          <TextInput placeholder="Код друга, например AB12CD34" value={addCode} onChange={(e) => setAddCode(e.target.value)} />
          <Button onClick={addFriend}>Добавить друга</Button>
        </div>
      </div>

      {friends.length === 0 ? (
        <EmptyState title="Друзей пока нет" text="Передайте свой код другу или добавьте его по коду." />
      ) : (
        <div className="friend-list">
          {friends.map((f) => {
            const world = worlds[f.userId]
            return (
              <div key={f.userId} className="friend-row">
                <span className={`presence-dot ${f.online ? 'online' : ''}`} />
                <div className="account-meta">
                  <strong>{f.username}</strong>
                  <span className="muted small">
                    {f.online
                      ? f.status === 'in-game'
                        ? `в игре${f.versionId ? ` · ${f.versionId}` : ''}${f.instanceName ? ` · ${f.instanceName}` : ''}`
                        : 'в сети'
                      : 'не в сети'}
                  </span>
                </div>
                {world && (
                  <Button variant="subtle" onClick={() => join(f)} disabled={joining === f.userId}>
                    {joining === f.userId ? 'Подключение…' : 'Присоединиться к миру'}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => removeFriend(f.userId)}>Удалить</Button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Скачать сборку друга</h3>
          <p className="muted small">Введите код — моды, ресурспаки и шейдеры скачаются автоматически.</p>
          <Field label="Код сборки">
            <TextInput value={importCode} onChange={(e) => setImportCode(e.target.value)} placeholder="AB12CD34" />
          </Field>
          <Field label="Название новой сборки">
            <TextInput value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Сборка друга" />
          </Field>
          <Button onClick={importModpack} disabled={importing}>{importing ? 'Загрузка…' : 'Скачать сборку'}</Button>
          {importProgress && <Progress value={importProgress.done} max={importProgress.total || 1} label="Загрузка файлов" />}
        </div>

        <div className="card">
          <h3>Поделиться своей сборкой</h3>
          <p className="muted small">Друг получит код и сможет скачать вашу сборку.</p>
          <Field label="Сборка">
            <Select value={shareTarget} onChange={(e) => setShareTarget(e.target.value)}>
              {instances.length === 0 && <option value="">Нет сборок</option>}
              {instances.map((i) => (
                <option key={i.name} value={i.name}>{i.displayName}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={share} disabled={!shareTarget}>Получить код</Button>
        </div>
      </div>

      <Modal open={!!joinInfo} title="Подключение к миру" onClose={() => { api.stopJoining(); setJoinInfo(null) }}>
        {joinInfo && (
          <>
            <p>В Minecraft откройте «Сетевая игра» → «По адресу» и введите:</p>
            <div className="ms-code">localhost:{joinInfo.localPort}</div>
            <p className="muted small">Туннель работает, пока открыт лаунчер. Не закрывайте это окно во время игры.</p>
            <div className="btn-row">
              <Button onClick={() => { navigator.clipboard.writeText(`localhost:${joinInfo.localPort}`); toast('Адрес скопирован.', 'success') }}>
                Скопировать адрес
              </Button>
              <Button variant="danger" onClick={() => { api.stopJoining(); setJoinInfo(null) }}>Отключиться</Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!shareCode} title="Код вашей сборки" onClose={() => setShareCode(null)}>
        <div className="ms-code">{shareCode}</div>
        <div className="btn-row">
          <Button onClick={() => { navigator.clipboard.writeText(shareCode ?? ''); toast('Код скопирован.', 'success') }}>Скопировать</Button>
          <Button variant="ghost" onClick={() => setShareCode(null)}>Закрыть</Button>
        </div>
      </Modal>
    </div>
  )
}