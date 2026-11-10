import { useRef, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Button, Field, TextInput, Modal } from './ui'

export default function AccountLogin({ onAuthenticated }: { onAuthenticated: () => void }): JSX.Element {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [msPrompt, setMsPrompt] = useState<MsPrompt | null>(null)
  const [showEly, setShowEly] = useState(false)
  const [elyServer, setElyServer] = useState('https://authserver.ely.by')
  const [elyUser, setElyUser] = useState('')
  const [elyPass, setElyPass] = useState('')
  const [showOffline, setShowOffline] = useState(false)
  const [offlineName, setOfflineName] = useState('')
  const msCancelled = useRef(false)

  async function startMicrosoft(): Promise<void> {
    setBusy('ms')
    setMsPrompt(null)
    msCancelled.current = false
    const off = api.onMsPrompt((p) => setMsPrompt(p))
    try {
      await api.loginMicrosoft()
      toast('Аккаунт Microsoft добавлен.', 'success')
      onAuthenticated()
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
      setShowEly(false)
      setElyPass('')
      onAuthenticated()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function loginOffline(): Promise<void> {
    const name = offlineName.trim()
    if (!name) {
      toast('Введите ник.', 'error')
      return
    }
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast('Ник: 3–16 символов, латиница, цифры и подчёркивание.', 'error')
      return
    }
    setBusy('offline')
    try {
      await api.addOfflineAccount(name)
      toast('Оффлайн-аккаунт создан.', 'success')
      setOfflineName('')
      onAuthenticated()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="account-login">
      <Button className="login-btn login-ms" onClick={startMicrosoft} disabled={busy === 'ms'}>
        {busy === 'ms' ? 'Ожидание входа…' : 'Войти через Microsoft'}
      </Button>
      <Button variant="subtle" className="login-btn" onClick={() => setShowEly(true)} disabled={busy !== null}>
        Войти через ely.by
      </Button>
      <Button variant="ghost" className="login-btn btn-offline" onClick={() => setShowOffline((v) => !v)} disabled={busy !== null}>
        Оффлайн
      </Button>

      {showOffline && (
        <div className="offline-form">
          <TextInput
            autoFocus
            placeholder="Введите ник"
            value={offlineName}
            onChange={(e) => setOfflineName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loginOffline()
            }}
          />
          <Button onClick={loginOffline} disabled={busy === 'offline'}>
            {busy === 'offline' ? 'Вход…' : 'Войти'}
          </Button>
        </div>
      )}

      <Modal open={msPrompt !== null} title="Вход Microsoft" onClose={cancelMicrosoft} locked confirmClose>
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

      <Modal open={showEly} title="Вход через ely.by" onClose={() => setShowEly(false)}>
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
          <Button variant="ghost" onClick={() => setShowEly(false)}>Отмена</Button>
        </div>
      </Modal>
    </div>
  )
}