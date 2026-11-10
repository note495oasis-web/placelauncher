import AccountLogin from './AccountLogin'

export default function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }): JSX.Element {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">◈</div>
        <h1 className="login-title">Aurora Launcher</h1>
        <p className="login-subtitle">Вход</p>
        <AccountLogin onAuthenticated={onAuthenticated} />
        <p className="login-hint muted">
          Java и файлы игры скачаются автоматически. Оффлайн-режим не требует покупки Minecraft.
        </p>
      </div>
    </div>
  )
}