import { useEffect, useState } from 'react'
import { api } from '../lib'

const headCache = new Map<string, string>()

const PIXELS = [
  'hhhhhhhh',
  'hssssssh',
  'ssssssss',
  'swissiws',
  'ssssssss',
  'ssddddss',
  'ssmmmmss',
  'hssssssh'
]
const COLORS: Record<string, string> = {
  h: '#3b2f23',
  s: '#c69c6d',
  d: '#a07850',
  w: '#ffffff',
  i: '#5a4a9a',
  m: '#7a5c3e'
}

function SteveHead({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {PIXELS.map((row, y) =>
        row.split('').map((c, x) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[c]} />)
      )}
    </svg>
  )
}

export default function SkinHead({
  account,
  size = 40
}: {
  account?: LauncherAccount | null
  size?: number
}): JSX.Element {
  const [src, setSrc] = useState<string | null>(account ? headCache.get(account.id) ?? null : null)

  useEffect(() => {
    let alive = true
    if (!account) {
      setSrc(null)
      return
    }
    const cached = headCache.get(account.id)
    if (cached) {
      setSrc(cached)
      return
    }
    setSrc(null)
    api
      .getAccountHead(account.id)
      .then((data) => {
        if (!alive || !data) return
        headCache.set(account.id, data)
        setSrc(data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [account?.id])

  return (
    <span className="skin-head" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} width={size} height={size} alt={account?.username ?? 'head'} style={{ imageRendering: 'pixelated' }} />
      ) : (
        <SteveHead size={size} />
      )}
    </span>
  )
}