import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync, renameSync } from 'fs'
import { registerIpc } from './ipc'
import { shutdownFriends } from './friends/service'
import { initUpdater } from './updater'
import { initLogger } from './logger'

// Preserve user data across the Aurora → PlaceLauncher rebrand: migrate the legacy
// userData folder once, falling back to it when files are still locked by a running game.
const appData = app.getPath('appData')
const legacyDataDir = join(appData, 'aurora-launcher')
const dataDir = join(appData, 'placelauncher')
if (!existsSync(dataDir) && existsSync(legacyDataDir)) {
  try {
    renameSync(legacyDataDir, dataDir)
  } catch {
    // folder in use — keep the legacy path so no data is lost
  }
}
app.setPath('userData', existsSync(dataDir) ? dataDir : existsSync(legacyDataDir) ? legacyDataDir : dataDir)
initLogger()

function createWindow(): void {
  const iconPath = join(app.getAppPath(), 'build', 'icon.ico')
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  initUpdater()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  shutdownFriends()
})