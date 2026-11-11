import { useEffect, useState } from 'react'
import PlayScreen from './components/PlayScreen'
import ModpacksScreen from './components/ModpacksScreen'
import FriendsScreen from './components/FriendsScreen'
import LogsScreen from './components/LogsScreen'
import SettingsScreen from './components/SettingsScreen'
import CreateInstanceModal from './components/CreateInstanceModal'
import UpdateButton from './components/UpdateButton'
import LoginScreen from './components/LoginScreen'
import AccountMenu from './components/AccountMenu'
import SkinHead from './components/SkinHead'
import { Spinner } from './components/ui'
import { ToastProvider } from './components/toast'
import { applyTheme, DEFAULT_THEME, type ThemeSettings } from './theme'
import logo from './assets/logo.png'

type Tab = 'play' | 'modpacks' | 'friends' | 'logs' | 'settings'

function accountTypeLabel(t: string): string {
  return t === 'microsoft' ? 'Microsoft' : t === 'authlib' ? 'ely.by' : 'оффлайн'
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'play', label: 'Играть', icon: '▶' },
  { id: 'modpacks', label: 'Модпаки', icon: '▣' },
  { id: 'friends', label: 'Друзья', icon: '◎' },
  { id: 'logs', label: 'Логи', icon: '☰' },
  { id: 'settings', label: 'Настройки', icon: '✦' }
]

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('play')
  const [collapsed, setCollapsed] = useState(false)
  const [version, setVersion] = useState('…')
  const [createOpen, setCreateOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [activeAccount, setActiveAccount] = useState<LauncherAccount | null | undefined>(undefined)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  function loadActive(): void {
    window.launcher
      .getActiveAccount()
      .then((a) => setActiveAccount(a ?? null))
      .catch(() => setActiveAccount(null))
  }

  useEffect(() => {
    loadActive()
    window.launcher.getAppVersion().then(setVersion).catch(() => setVersion('?'))
    window.launcher
      .getSettings()
      .then((s) => applyTheme((s.theme as ThemeSettings) ?? DEFAULT_THEME))
      .catch(() => applyTheme(DEFAULT_THEME))
  }, [])

  return (
    <ToastProvider>
      {activeAccount === undefined ? (
        <div className="app-loading"><Spinner label="Загрузка…" /></div>
      ) : activeAccount === null ? (
        <LoginScreen onAuthenticated={loadActive} />
      ) : (
        <>
          <div className="app">
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
              <div className="brand">
                <img className="brand-logo" src={logo} alt="" />
                {!collapsed && <span className="brand-name">PlaceLauncher</span>}
                <button
                  className="collapse-btn"
                  onClick={() => setCollapsed((c) => !c)}
                  title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
                >
                  {collapsed ? '›' : '‹'}
                </button>
              </div>

              <button className="create-instance-btn" onClick={() => setCreateOpen(true)} title="Создать экземпляр">
                <span className="nav-icon">＋</span>
                {!collapsed && <span>Создать экземпляр</span>}
              </button>

              <nav className="nav">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    className={`nav-item ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                    title={t.label}
                  >
                    <span className="nav-icon">{t.icon}</span>
                    {!collapsed && <span className="nav-label">{t.label}</span>}
                  </button>
                ))}
              </nav>

              <div className="sidebar-footer">
                <button className="account-btn" onClick={() => setAccountMenuOpen(true)} title="Выбор аккаунта">
                  <SkinHead account={activeAccount} size={36} />
                  {!collapsed && (
                    <span className="account-btn-meta">
                      <strong>{activeAccount.username}</strong>
                      <span className="muted">{accountTypeLabel(activeAccount.type)}</span>
                    </span>
                  )}
                </button>
                <UpdateButton compact={collapsed} />
                {!collapsed && <span className="footer-version">v{version}</span>}
              </div>
            </aside>

            <main className="content">
              <div className={`tab-pane ${tab === 'play' ? '' : 'hidden'}`}>
                <PlayScreen refreshToken={refreshToken} onCreate={() => setCreateOpen(true)} />
              </div>
              <div className={`tab-pane ${tab === 'modpacks' ? '' : 'hidden'}`}><ModpacksScreen /></div>
              <div className={`tab-pane ${tab === 'friends' ? '' : 'hidden'}`}><FriendsScreen /></div>
              <div className={`tab-pane ${tab === 'logs' ? '' : 'hidden'}`}><LogsScreen /></div>
              <div className={`tab-pane ${tab === 'settings' ? '' : 'hidden'}`}><SettingsScreen /></div>
            </main>
          </div>

          <CreateInstanceModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={() => setRefreshToken((t) => t + 1)}
          />
          <AccountMenu
            open={accountMenuOpen}
            onClose={() => setAccountMenuOpen(false)}
            onChanged={loadActive}
          />
        </>
      )}
    </ToastProvider>
  )
}