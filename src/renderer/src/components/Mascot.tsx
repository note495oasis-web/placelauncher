import { useEffect, useRef, useState } from 'react'

const phrases = [
  'Привет! Я Кубик — хранитель твоих сборок.',
  'Совет: выдели игре побольше памяти в настройках экземпляра.',
  'Нажми F2 в игре — снимок появится во вкладке «Скриншоты».',
  'Кнопка «Ссылка на лог» копирует ссылку на логи — удобно кинуть другу.',
  'Дублируй сборку перед экспериментами с модами!',
  'Обложку сборки можно поменять в редакторе экземпляра.',
  'Миры и скриншоты теперь живут прямо в лаунчере.',
  'Ровных FPS и хорошего дня!'
]

export function MascotSvg(): JSX.Element {
  return (
    <svg viewBox="0 0 120 120" width="104" height="104" aria-hidden="true">
      <defs>
        <linearGradient id="mascot-body-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4be07a" />
          <stop offset="1" stopColor="#1f8f4a" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="26" ry="6" fill="rgba(0,0,0,0.35)" />
      <g className="mascot-body">
        <line x1="60" y1="38" x2="60" y2="26" stroke="#2aa25a" strokeWidth="3" />
        <circle className="mascot-ant" cx="60" cy="21" r="5" fill="#7dffa8" />
        <rect className="mascot-arm" x="88" y="58" width="10" height="24" rx="5" fill="#1f8f4a" />
        <rect x="30" y="38" width="60" height="60" rx="14" fill="url(#mascot-body-g)" stroke="rgba(255,255,255,0.18)" />
        <rect x="37" y="45" width="18" height="9" rx="4.5" fill="rgba(255,255,255,0.2)" />
        <g className="mascot-eyes">
          <rect className="mascot-eye" x="45" y="60" width="8" height="13" rx="4" fill="#07130b" />
          <rect className="mascot-eye" x="67" y="60" width="8" height="13" rx="4" fill="#07130b" />
          <path d="M50 80 q10 8 20 0" stroke="#07130b" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <circle cx="40" cy="76" r="4" fill="rgba(255,255,255,0.16)" />
        <circle cx="80" cy="76" r="4" fill="rgba(255,255,255,0.16)" />
        <rect className="mascot-foot foot-a" x="38" y="96" width="15" height="10" rx="5" fill="#177a41" />
        <rect className="mascot-foot foot-b" x="67" y="96" width="15" height="10" rx="5" fill="#177a41" />
      </g>
    </svg>
  )
}

export default function Mascot(): JSX.Element {
  const [phrase, setPhrase] = useState<string | null>(null)
  const [jump, setJump] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  function click(): void {
    setPhrase(phrases[Math.floor(Math.random() * phrases.length)])
    setJump(true)
    timers.current.push(window.setTimeout(() => setJump(false), 700))
    timers.current.push(window.setTimeout(() => setPhrase(null), 4200))
  }

  return (
    <div className={`mascot ${jump ? 'jump' : ''}`}>
      {phrase && <div className="mascot-bubble">{phrase}</div>}
      <button className="mascot-btn" onClick={click} title="Кубик — маскот PlaceLauncher" aria-label="Маскот Кубик">
        <MascotSvg />
      </button>
    </div>
  )
}