import { useEffect, useRef, useState } from 'react'
import { api } from '../lib'
import { MascotSvg } from './Mascot'

interface Step {
  target?: string
  text: string
}

const STEPS: Step[] = [
  { text: 'Привет! Я Кубик — хранитель PlaceLauncher. Давай прогуляемся по лаунчеру: я покажу, где что лежит.' },
  { target: '[data-tour="create"]', text: 'Это «Создать экземпляр». Экземпляр — отдельная сборка Minecraft: своя версия, свои моды и свои настройки.' },
  { target: '[data-tour="nav-play"]', text: 'Раздел «Играть»: тут живут все твои сборки — карточки экземпляров, поиск и импорт из Prism.' },
  { target: '[data-tour="hero-play"]', text: 'Большая кнопка «Играть» запускает выбранную сборку. Java и файлы игры скачаются сами — вручную ставить ничего не нужно.' },
  { target: '[data-tour="nav-modpacks"]', text: '«Модпаки» — каталог готовых сборок с Modrinth и CurseForge. Установка в один клик.' },
  { target: '[data-tour="nav-logs"]', text: '«Логи» — журнал лаунчера и игры. Если что-то сломалось, тут видно почему. Кнопка «Ссылка на лог» делится журналом.' },
  { target: '[data-tour="nav-settings"]', text: '«Настройки»: память, Java, прокси для Modrinth и CurseForge, аккаунты и режимы снапшотов.' },
  { target: '[data-tour="account"]', text: 'Тут твой аккаунт: Microsoft, ely.by или оффлайн. Можно добавить несколько и переключаться между ними.' },
  { text: 'Вот и всё! Я живу внизу справа — кликни по мне, если станет скучно. Удачной игры!' }
]

const M = 92
const WALK_MS = 1200

function homePos(): { x: number; y: number } {
  return { x: window.innerWidth - M - 16, y: window.innerHeight - M - 10 }
}

function spotFor(sel?: string): DOMRect | null {
  if (!sel) return null
  const el = document.querySelector(sel)
  return el ? el.getBoundingClientRect() : null
}

export default function Tour({ onDone }: { onDone: () => void }): JSX.Element {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'talk' | 'walk'>('talk')
  const [pos, setPos] = useState(homePos)
  const [facing, setFacing] = useState<'left' | 'right' | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const walkTimer = useRef<number | null>(null)
  const faceOnArrive = useRef<'left' | 'right' | null>(null)

  useEffect(() => () => {
    if (walkTimer.current) clearTimeout(walkTimer.current)
  }, [])

  function arrive(): void {
    if (walkTimer.current) {
      clearTimeout(walkTimer.current)
      walkTimer.current = null
    }
    setPhase('talk')
    setFacing(faceOnArrive.current)
  }

  function goTo(next: number): void {
    let i = next
    while (i < STEPS.length - 1 && STEPS[i].target && !spotFor(STEPS[i].target)) i++
    const r = spotFor(STEPS[i].target)
    setIdx(i)
    setRect(r)
    setPhase('walk')
    if (walkTimer.current) clearTimeout(walkTimer.current)
    walkTimer.current = window.setTimeout(arrive, WALK_MS + 200)
    if (!r) {
      const dest = i === STEPS.length - 1 ? homePos() : pos
      faceOnArrive.current = null
      setFacing(dest.x > pos.x + 4 ? 'right' : dest.x < pos.x - 4 ? 'left' : null)
      setPos(dest)
      return
    }
    const standRight = r.left + r.width / 2 < window.innerWidth / 2
    const x = Math.min(Math.max(standRight ? r.right + 14 : r.left - M - 14, 8), window.innerWidth - M - 8)
    const y = Math.min(Math.max(r.top + r.height / 2 - M / 2, 8), window.innerHeight - M - 8)
    faceOnArrive.current = standRight ? 'left' : 'right'
    setFacing(x > pos.x + 4 ? 'right' : x < pos.x - 4 ? 'left' : faceOnArrive.current)
    setPos({ x, y })
  }

  function finish(): void {
    api.setSettings({ tutorialDone: true } as unknown as Record<string, unknown>).then(onDone, onDone)
  }

  function next(): void {
    if (idx === STEPS.length - 1) finish()
    else goTo(idx + 1)
  }

  const talking = phase === 'talk'
  const bubbleLeft = Math.min(Math.max(pos.x + M / 2 - 140, 8), window.innerWidth - 288)
  const bubbleAbove = pos.y > 250
  const bubbleStyle = bubbleAbove
    ? { left: bubbleLeft, bottom: window.innerHeight - pos.y + 10 }
    : { left: bubbleLeft, top: pos.y + M + 10 }

  return (
    <>
      <div className={`tour-shade ${talking && rect ? 'hole' : ''}`} />
      {talking && rect && (
        <div
          className="tour-spot"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        className={`tour-walker ${phase === 'walk' ? 'walking' : ''} ${talking && rect ? 'pointing' : ''} ${facing === 'left' ? 'face-left' : facing === 'right' ? 'face-right' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        onTransitionEnd={(e) => {
          if (phase === 'walk' && (e.propertyName === 'left' || e.propertyName === 'top')) arrive()
        }}
      >
        <span className={`tour-flip ${facing === 'left' ? 'left' : ''}`}>
          <MascotSvg />
        </span>
      </div>
      {talking && (
        <div className={`tour-bubble ${bubbleAbove ? '' : 'below'}`} style={bubbleStyle}>
          <div className="tour-step">Шаг {idx + 1} из {STEPS.length}</div>
          <p>{STEPS[idx].text}</p>
          <div className="tour-actions">
            <button className="btn btn-primary" onClick={next}>
              {idx === 0 ? 'Поехали' : idx === STEPS.length - 1 ? 'Завершить' : 'Далее'}
            </button>
            <button className="tour-skip" onClick={finish}>Пропустить</button>
          </div>
        </div>
      )}
    </>
  )
}