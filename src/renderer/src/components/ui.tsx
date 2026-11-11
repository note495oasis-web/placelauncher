import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

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

export function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: ReactNode
  hint?: string
}): JSX.Element {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
    </label>
  )
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  className = '',
  placeholder = '—'
}: {
  value: string | number
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode
  disabled?: boolean
  className?: string
  placeholder?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const options = useMemo(() => {
    const out: { value: string; label: ReactNode }[] = []
    Children.forEach(children, (c) => {
      if (isValidElement(c) && c.type === 'option') {
        const p = c.props as { value?: string | number; children?: ReactNode }
        out.push({ value: String(p.value ?? ''), label: p.children })
      }
    })
    return out
  }, [children])

  const current = options.find((o) => o.value === String(value))

  useLayoutEffect(() => {
    if (open && wrapRef.current) setRect(wrapRef.current.getBoundingClientRect())
  }, [open])

  useEffect(() => {
    if (!open) return
    const update = (): void => {
      if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect())
    }
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!wrapRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0
  const maxH = Math.max(140, Math.min(320, spaceBelow - 16))

  return (
    <div className={`select ${className} ${disabled ? 'disabled' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="input select-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="select-value">{current ? current.label : placeholder}</span>
        <span className="select-arrow">▾</span>
      </button>
      {open && rect &&
        createPortal(
          <div
            className="select-menu"
            ref={menuRef}
            role="listbox"
            style={{ position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: maxH, zIndex: 300 }}
          >
            {options.map((o) => (
              <button
                type="button"
                key={o.value}
                role="option"
                aria-selected={o.value === String(value)}
                className={`select-option ${o.value === String(value) ? 'active' : ''}`}
                onClick={() => {
                  onChange({ target: { value: o.value } })
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
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