export type ThemePreset = 'standard' | 'purple' | 'custom'

export interface ThemeSettings {
  preset: ThemePreset
  customStart: string
  customEnd: string
  angle: number
}

export const DEFAULT_THEME: ThemeSettings = {
  preset: 'standard',
  customStart: '#8a2be2',
  customEnd: '#000000',
  angle: 135
}

export const PRESETS: { id: ThemePreset; label: string; start: string; end: string }[] = [
  { id: 'standard', label: 'Стандартная', start: '#ffffff', end: '#000000' },
  { id: 'purple', label: 'Фиолетово-чёрная', start: '#8a2be2', end: '#000000' },
  { id: 'custom', label: 'Своя', start: '#8a2be2', end: '#000000' }
]

export function themeColors(t: ThemeSettings): { start: string; end: string; angle: number } {
  if (t.preset === 'standard') return { start: '#ffffff', end: '#000000', angle: 135 }
  if (t.preset === 'purple') return { start: '#8a2be2', end: '#000000', angle: 135 }
  return { start: t.customStart, end: t.customEnd, angle: t.angle }
}

export function gradientCss(t: ThemeSettings): string {
  const c = themeColors(t)
  return `linear-gradient(${c.angle}deg, ${c.start} 0%, ${c.end} 100%)`
}

export function applyTheme(t: ThemeSettings): void {
  const c = themeColors(t)
  const root = document.documentElement
  root.style.setProperty('--grad-start', c.start)
  root.style.setProperty('--grad-end', c.end)
  root.style.setProperty('--grad-angle', `${c.angle}deg`)
}