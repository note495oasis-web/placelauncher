import { join } from 'path'
import { app } from 'electron'
import { getSettings } from '../store'

export function gameDir(): string {
  const s = getSettings()
  return s.gameDir || join(app.getPath('userData'), 'game')
}