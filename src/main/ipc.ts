import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron'
import { log, logLines, getLogs, clearLogs, saveLogs } from './logger'
import { getSettings, setSettings, type Settings } from './store'
import { testEndpoint, refreshPool, poolStatus, type ProxyEndpoint } from './net/proxy'
import { loginWithDeviceCode } from './auth/microsoft'
import { loginAuthlib, ELY_BY } from './auth/authlib'
import { listAccounts, getActive, setActive, removeAccount, addOffline } from './auth/accounts'
import { getAccountHead } from './auth/head'
import { fetchManifest } from './game/versions'
import { launchInstance, stopGame, isRunning, gameDir, type LaunchRequest } from './game/runner'
import { findJava, downloadJava } from './game/java'
import { searchModrinth, getModrinthVersions } from './mods/modrinth'
import { searchCurseforge, getCurseforgeFiles } from './mods/curseforge'
import { listContentFiles, removeContentFile, type ContentDir } from './mods/install'
import { installModrinthPack, installCurseforgePack } from './mods/packs'
import type { ModSearchOptions } from './mods/types'
import {
  listInstances,
  createInstance,
  updateInstance,
  deleteInstance,
  instanceDir,
  type Instance,
  type InstanceLoader
} from './instances/manager'
import { scanAllLaunchers, importPrismInstance, type PrismInstanceInfo } from './instances/importPrism'
import {
  exportModpack,
  importModpack,
  installTrackedMod,
  listTracked,
  unrecordInstall,
  type ModpackManifest,
  type TrackedFile
} from './instances/modpack'
import { friends, type PresenceStatus } from './friends/client'
import {
  initFriendsEvents,
  getWorlds,
  getHostState,
  getGuestState,
  startHost,
  stopHost,
  startJoin,
  stopJoin,
  setStatus,
  onGameLaunch,
  onGameLog,
  onGameStop,
  shareInstance,
  importShared
} from './friends/service'

let msLoginAbort: AbortController | null = null

export function registerIpc(): void {
  initFriendsEvents()
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('clipboard:write', (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle('logs:get', () => getLogs())
  ipcMain.handle('logs:clear', () => {
    clearLogs()
    return true
  })
  ipcMain.handle('logs:save', () => saveLogs())
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => setSettings(patch))

  ipcMain.handle('proxy:test', (_event, endpoint?: ProxyEndpoint) => {
    const p = endpoint ?? getSettings().proxy
    return testEndpoint({ type: p.type, host: p.host, port: p.port, username: p.username, password: p.password })
  })
  ipcMain.handle('proxy:status', () => ({ mode: getSettings().proxy.mode, ...poolStatus() }))
  ipcMain.handle('proxy:refresh', async () => {
    await refreshPool()
    return poolStatus()
  })

  ipcMain.handle('auth:accounts', () => listAccounts())
  ipcMain.handle('auth:active', () => getActive())
  ipcMain.handle('auth:setActive', (_event, id: string) => {
    setActive(id)
    return getActive()
  })
  ipcMain.handle('auth:remove', (_event, id: string) => {
    removeAccount(id)
    return listAccounts()
  })
  ipcMain.handle('auth:offline', (_event, username: string) => addOffline(username))
  ipcMain.handle('auth:head', (_event, id: string) => getAccountHead(id))
  ipcMain.handle('auth:ms:login', async () => {
    const clientId = getSettings().microsoftClientId
    const win = BrowserWindow.getAllWindows()[0]
    msLoginAbort = new AbortController()
    return loginWithDeviceCode(
      clientId,
      (prompt) => {
        clipboard.writeText(prompt.userCode)
        void shell.openExternal(prompt.verificationUri)
        win?.webContents.send('auth:ms:prompt', prompt)
      },
      msLoginAbort.signal
    )
  })
  ipcMain.handle('auth:ms:cancel', () => {
    msLoginAbort?.abort()
    return true
  })
  ipcMain.handle('auth:authlib:login', (_event, serverUrl: string, username: string, password: string) =>
    loginAuthlib(serverUrl || ELY_BY, username, password)
  )

  ipcMain.handle('game:versions', async (_event, type?: string) => {
    const manifest = await fetchManifest()
    const versions = type ? manifest.versions.filter((v) => v.type === type) : manifest.versions
    return {
      latest: manifest.latest,
      versions: versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
    }
  })
  ipcMain.handle('game:launch', (_event, req: LaunchRequest) => {
    const win = BrowserWindow.getAllWindows()[0]
    log('info', 'launcher', `Запуск экземпляра «${req.instanceName}»${req.versionId ? ` (${req.versionId})` : ''}`)
    onGameLaunch({ versionId: req.versionId, instanceName: req.instanceName })
    return launchInstance(
      req,
      (p) => win?.webContents.send('game:progress', p),
      (line) => {
        logLines('game', 'game', line)
        win?.webContents.send('game:log', line)
        onGameLog(line, { versionId: req.versionId, instanceName: req.instanceName })
      }
    )
      .then((code) => {
        log('info', 'launcher', `Игра завершена (код ${code})`)
        return code
      })
      .catch((err) => {
        log('error', 'launcher', err instanceof Error ? err.message : String(err))
        throw err
      })
  })
  ipcMain.handle('game:stop', () => {
    log('info', 'launcher', 'Остановка игры')
    stopGame()
    onGameStop()
    return true
  })
  ipcMain.handle('game:running', () => isRunning())
  ipcMain.handle('java:find', () => findJava())
  ipcMain.handle('java:download', (_event, major: number) => {
    const win = BrowserWindow.getAllWindows()[0]
    return downloadJava(major, gameDir(), (received, total) =>
      win?.webContents.send('java:progress', { received, total })
    )
  })

  ipcMain.handle('mods:search', (_event, source: 'modrinth' | 'curseforge', query: string, opts: ModSearchOptions) =>
    source === 'curseforge' ? searchCurseforge(query, opts) : searchModrinth(query, opts)
  )
  ipcMain.handle('mods:versions', (_event, source: 'modrinth' | 'curseforge', projectId: string, opts: ModSearchOptions) =>
    source === 'curseforge' ? getCurseforgeFiles(projectId, opts) : getModrinthVersions(projectId, opts)
  )
  ipcMain.handle(
    'mods:install',
    (
      _event,
      instanceName: string,
      source: TrackedFile['source'],
      projectId: string | undefined,
      file: { url: string; filename: string; size?: number },
      subdir: ContentDir
    ) => installTrackedMod(instanceName, source, projectId, file, subdir)
  )
  ipcMain.handle('modpacks:install', (_event, source: 'modrinth' | 'curseforge', url: string, title: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    const cb = (done: number, total: number): void => {
      win?.webContents.send('modpack:progress', { done, total })
    }
    return source === 'curseforge' ? installCurseforgePack(url, title, cb) : installModrinthPack(url, title, cb)
  })
  ipcMain.handle('content:list', (_event, instanceName: string, subdir: ContentDir) =>
    listContentFiles(instanceDir(instanceName), subdir)
  )
  ipcMain.handle('content:remove', (_event, instanceName: string, subdir: ContentDir, filename: string) => {
    removeContentFile(instanceDir(instanceName), subdir, filename)
    unrecordInstall(instanceName, filename, subdir)
    return listContentFiles(instanceDir(instanceName), subdir)
  })

  ipcMain.handle('instances:list', () => listInstances())
  ipcMain.handle(
    'instances:create',
    (_event, opts: { name: string; displayName?: string; versionId: string; loader?: InstanceLoader; source?: string }) =>
      createInstance(opts)
  )
  ipcMain.handle('instances:update', (_event, name: string, patch: Partial<Instance>) =>
    updateInstance(name, patch)
  )
  ipcMain.handle('instances:delete', (_event, name: string) => {
    deleteInstance(name)
    return listInstances()
  })
  ipcMain.handle('instance:openFolder', (_event, name: string) => shell.openPath(instanceDir(name)))

  ipcMain.handle('import:scan', () => scanAllLaunchers())
  ipcMain.handle('import:prism', async (_event, info: PrismInstanceInfo) => {
    log('info', 'import', `Импорт из Prism: «${info.name}» (${info.versionId})`)
    const inst = await importPrismInstance(info, (done, total) => {
      if (done === total || done % 10 === 0) log('info', 'import', `Загрузка модов CurseForge: ${done}/${total}`)
    })
    const mods = listContentFiles(instanceDir(inst.name), 'mods').length
    log('info', 'import', `Импортировано «${inst.name}»: модов ${mods}`)
    return inst
  })

  ipcMain.handle('modpack:tracked', (_event, name: string) => listTracked(name))
  ipcMain.handle('modpack:export', (_event, name: string) => exportModpack(name))
  ipcMain.handle('modpack:import', (_event, manifest: ModpackManifest, newName: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    return importModpack(manifest, newName, (done, total) =>
      win?.webContents.send('modpack:progress', { done, total })
    )
  })

  ipcMain.handle('friends:identity', () => friends.getIdentity())
  ipcMain.handle('friends:register', async (_event, username: string) => {
    const identity = await friends.register(username)
    friends.connectPresence()
    return identity
  })
  ipcMain.handle('friends:logout', () => {
    friends.logout()
    return true
  })
  ipcMain.handle('friends:me', () => friends.me())
  ipcMain.handle('friends:list', () => friends.listFriends())
  ipcMain.handle('friends:add', (_event, friendCode: string) => friends.addFriend(friendCode))
  ipcMain.handle('friends:remove', (_event, userId: string) => friends.removeFriend(userId))
  ipcMain.handle('friends:connect', () => {
    friends.connectPresence()
    return true
  })
  ipcMain.handle('friends:disconnect', () => {
    friends.disconnectPresence()
    return true
  })
  ipcMain.handle('friends:setStatus', (_event, status: PresenceStatus) => {
    setStatus(status)
    return true
  })
  ipcMain.handle('friends:worlds', () => getWorlds())
  ipcMain.handle('friends:share', (_event, instanceName: string) => shareInstance(instanceName))
  ipcMain.handle('friends:fetchModpack', (_event, code: string) => friends.fetchModpack(code))
  ipcMain.handle('friends:importModpack', (_event, code: string, newName: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    return importShared(code, newName, (done, total) => win?.webContents.send('modpack:progress', { done, total }))
  })
  ipcMain.handle(
    'friends:host',
    (_event, opts: { port: number; versionId?: string | null; instanceName?: string | null }) => startHost(opts)
  )
  ipcMain.handle('friends:stopHost', () => {
    stopHost()
    return true
  })
  ipcMain.handle('friends:hostState', () => getHostState())
  ipcMain.handle('friends:join', (_event, session: string) => startJoin(session))
  ipcMain.handle('friends:stopJoin', () => {
    stopJoin()
    return true
  })
  ipcMain.handle('friends:guestState', () => getGuestState())
}