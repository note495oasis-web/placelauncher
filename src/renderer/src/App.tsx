import { useEffect, useState } from 'react'
import PlayScreen from './components/PlayScreen'
import ModpacksScreen from './components/ModpacksScreen'
import LogsScreen from './components/LogsScreen'
import SettingsScreen from './components/SettingsScreen'
import CreateInstanceModal from './components/CreateInstanceModal'
import UpdateButton from './components/UpdateButton'
import LoginScreen from './components/LoginScreen'
import AccountMenu from './components/AccountMenu'
import Mascot from './components/Mascot'
import Tour from './components/Tour'
import SkinHead from './components/SkinHead'
import { Spinner } from './components/ui'
import { ToastProvider } from './components/toast'
import { IconPlay, IconGrid, IconTerminal, IconGear, IconPlus, IconChevronLeft, IconChevronRight } from './components/Icons'
import logo from './assets/logo.png'

type Tab = 'play' | 'modpacks' | 'logs' | 'settings'

function accountTypeLabel(t: string): string {
  return t === 'microsoft' ? 'Microsoft' : t === 'authlib' ? 'ely.by' : 'оффлайн'
}

const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'play', label: 'Играть', icon: <IconPlay size={17} /> },
  { id: 'modpacks', label: 'Модпаки', icon: <IconGrid size={17} /> },
  { id: 'logs', label: 'Логи', icon: <IconTerminal size={17} /> },
  { id: 'settings', label: 'Настройки', icon: <IconGear size={17} /> }
]

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('play')
  const [collapsed, setCollapsed] = useState(false)
  const [version, setVersion] = useState('…')
  const [createOpen, setCreateOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [activeAccount, setActiveAccount] = useState<LauncherAccount | null | undefined>(undefined)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [tour, setTour] = useState(false)

  function loadActive(): void {
    window.launcher
      .getActiveAccount()
      .then((a) => {
        setActiveAccount(a ?? null)
        if (!a) return
        return window.launcher.getSettings().then((s) => {
          if (!Boolean((s as Record<string, unknown>).tutorialDone)) {
            setTab('play')
            setTour(true)
          }
        })
      })
      .catch(() => setActiveAccount(null))
  }

  useEffect(() => {
    loadActive()
    window.launcher.getAppVersion().then(setVersion).catch(() => setVersion('?'))
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
                  {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
                </button>
              </div>

              <button className="create-instance-btn" data-tour="create" onClick={() => setCreateOpen(true)} title="Создать экземпляр">
                <span className="nav-icon"><IconPlus size={16} /></span>
                {!collapsed && <span>Создать экземпляр</span>}
              </button>

              <nav className="nav">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    className={`nav-item ${tab === t.id ? 'active' : ''}`}
                    data-tour={`nav-${t.id}`}
                    onClick={() => setTab(t.id)}
                    title={t.label}
                  >
                    <span className="nav-icon">{t.icon}</span>
                    {!collapsed && <span className="nav-label">{t.label}</span>}
                  </button>
                ))}
              </nav>

              <div className="sidebar-footer">
                <button className="account-btn" data-tour="account" onClick={() => setAccountMenuOpen(true)} title="Выбор аккаунта">
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
              <div className={`tab-pane ${tab === 'logs' ? '' : 'hidden'}`}><LogsScreen /></div>
              <div className={`tab-pane ${tab === 'settings' ? '' : 'hidden'}`}>
                <SettingsScreen onStartTour={() => { setTab('play'); setTour(true) }} />
              </div>
            </main>
          </div>

          {tour ? <Tour onDone={() => setTour(false)} /> : <Mascot />}

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