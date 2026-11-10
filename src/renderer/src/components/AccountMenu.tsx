import { useEffect, useState } from 'react'
import { api, errText } from '../lib'
import { useToast } from './toast'
import { Modal, Button, Badge } from './ui'
import SkinHead from './SkinHead'
import AccountLogin from './AccountLogin'

function typeLabel(t: string): string {
  return t === 'microsoft' ? 'Microsoft' : t === 'authlib' ? 'ely.by' : 'оффлайн'
}

export default function AccountMenu({
  open,
  onClose,
  onChanged
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}): JSX.Element | null {
  const toast = useToast()
  const [accounts, setAccounts] = useState<LauncherAccount[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setAccounts(await api.listAccounts())
      const active = await api.getActiveAccount()
      setActiveId(active?.id ?? null)
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  async function choose(id: string): Promise<void> {
    try {
      await api.setActiveAccount(id)
      await refresh()
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await api.removeAccount(id)
      await refresh()
      onChanged()
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  return (
    <Modal open={open} title="Аккаунт" onClose={onClose}>
      <div className="account-list">
        {accounts.length === 0 && <p className="muted">Нет аккаунтов. Добавьте Microsoft, ely.by или оффлайн.</p>}
        {accounts.map((a) => (
          <div key={a.id} className={`account-row ${activeId === a.id ? 'active' : ''}`}>
            <SkinHead account={a} size={36} />
            <div className="account-meta">
              <strong>{a.username}</strong>
              <span className="muted">{typeLabel(a.type)}</span>
            </div>
            {activeId === a.id ? (
              <Badge tone="green">активен</Badge>
            ) : (
              <Button variant="subtle" onClick={() => choose(a.id)}>Выбрать</Button>
            )}
            <Button variant="ghost" onClick={() => remove(a.id)}>Удалить</Button>
          </div>
        ))}
      </div>
      <h3 className="account-menu-add-title">Добавить аккаунт</h3>
      <AccountLogin
        onAuthenticated={() => {
          void refresh()
          onChanged()
        }}
      />
    </Modal>
  )
}