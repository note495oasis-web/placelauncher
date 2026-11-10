import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'subtle' }): JSX.Element {
  return <button className={`btn btn-${variant} ${className}`} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className="input" {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select className="input" {...props} />
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  locked,
  confirmClose
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  locked?: boolean
  confirmClose?: boolean
}): JSX.Element | null {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={locked ? undefined : onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {(!locked || confirmClose) && (
            <button
              className="modal-close"
              onClick={confirmClose ? () => setConfirming(true) : onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
          )}
        </div>
        <div className="modal-body">
          {confirming ? (
            <div className="modal-confirm">
              <p>Вы точно уверены?</p>
              <div className="btn-row">
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(false)
                    onClose()
                  }}
                >
                  Да
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Нет
                </Button>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  )
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }): JSX.Element {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="progress-wrap">
      {label && <div className="progress-label">{label}</div>}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }): JSX.Element {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'accent' | 'warn' }): JSX.Element {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  )
}