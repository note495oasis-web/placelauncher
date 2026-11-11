import AccountLogin from './AccountLogin'
import logo from '../assets/logo.png'

export default function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }): JSX.Element {
  return (
    <div className="login-screen">
      <div className="login-card">
        <img className="login-logo" src={logo} alt="PlaceLauncher" />
        <h1 className="login-title">PlaceLauncher</h1>
        <p className="login-subtitle">Вход</p>
        <AccountLogin onAuthenticated={onAuthenticated} />
        <p className="login-hint muted">
          Java и файлы игры скачаются автоматически. Оффлайн-режим не требует покупки Minecraft.
        </p>
      </div>
    </div>
  )
}