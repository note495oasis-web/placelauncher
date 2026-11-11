import { contextBridge, ipcRenderer } from 'electron'

export interface MsPromptPayload {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
  message?: string
}

export interface InstanceLoaderInfo {
  type: 'fabric' | 'forge' | 'neoforge' | 'quilt'
  version: string
}

export interface LauncherInstance {
  name: string
  displayName: string
  versionId: string
  loader?: InstanceLoaderInfo
  memoryMb?: number
  createdAt: number
  lastPlayed?: number
  source?: string
}

export interface ImportableInstance {
  path: string
  name: string
  versionId: string
  loader?: InstanceLoaderInfo
}

export interface TrackedMod {
  source: 'modrinth' | 'curseforge' | 'url'
  projectId?: string
  filename: string
  url: string
  subdir: string
  size?: number
}

export interface ModpackManifestInfo {
  format: 1
  name: string
  versionId: string
  loader?: InstanceLoaderInfo
  files: TrackedMod[]
  configZip?: string
  createdAt: number
}

export interface FriendIdentity {
  userId: string
  username: string
  token: string
  friendCode: string
}

export interface FriendInfo {
  userId: string
  username: string
  friendCode: string
  online: boolean
  status: string
  versionId: string | null
  instanceName: string | null
  loader: InstanceLoaderInfo | null
}

export interface WorldInfo {
  userId: string
  username: string
  session: string
  hosting: boolean
  port: number | null
  versionId: string | null
  instanceName: string | null
}

export interface PresenceStatus {
  status: 'online' | 'in-game' | 'away'
  versionId?: string | null
  instanceName?: string | null
  loader?: InstanceLoaderInfo | null
}

export interface SharedModpack {
  manifest: ModpackManifestInfo
  ownerUsername: string
  createdAt: number
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error' | 'dev'
  version?: string
  percent?: number
  message?: string
}

export interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'debug' | 'game'
  source: string
  message: string
}

const api = {
  platform: process.platform,
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
  getSettings: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('settings:set', patch),

  testProxy: (endpoint?: Record<string, unknown>): Promise<{ ok: boolean; latency: number; status: number }> =>
    ipcRenderer.invoke('proxy:test', endpoint),
  proxyStatus: (): Promise<{ mode: string; count: number; active: string | null; lastRefresh: number }> =>
    ipcRenderer.invoke('proxy:status'),
  refreshProxyPool: (): Promise<{ count: number; active: string | null; lastRefresh: number }> =>
    ipcRenderer.invoke('proxy:refresh'),

  listAccounts: (): Promise<unknown[]> => ipcRenderer.invoke('auth:accounts'),
  getActiveAccount: (): Promise<unknown> => ipcRenderer.invoke('auth:active'),
  setActiveAccount: (id: string): Promise<unknown> => ipcRenderer.invoke('auth:setActive', id),
  removeAccount: (id: string): Promise<unknown[]> => ipcRenderer.invoke('auth:remove', id),
  addOfflineAccount: (username: string): Promise<unknown> => ipcRenderer.invoke('auth:offline', username),
  getAccountHead: (id: string): Promise<string | null> => ipcRenderer.invoke('auth:head', id),
  loginMicrosoft: (): Promise<unknown> => ipcRenderer.invoke('auth:ms:login'),
  cancelMicrosoft: (): Promise<boolean> => ipcRenderer.invoke('auth:ms:cancel'),
  loginAuthlib: (serverUrl: string, username: string, password: string): Promise<unknown> =>
    ipcRenderer.invoke('auth:authlib:login', serverUrl, username, password),
  onMsPrompt: (cb: (prompt: MsPromptPayload) => void): (() => void) => {
    const listener = (_event: unknown, prompt: MsPromptPayload): void => cb(prompt)
    ipcRenderer.on('auth:ms:prompt', listener)
    return () => ipcRenderer.removeListener('auth:ms:prompt', listener)
  },
  offMsPrompt: (): void => {
    ipcRenderer.removeAllListeners('auth:ms:prompt')
  },

  listVersions: (type?: string): Promise<unknown> => ipcRenderer.invoke('game:versions', type),
  launchGame: (req: { versionId: string; instanceName: string }): Promise<number> =>
    ipcRenderer.invoke('game:launch', req),
  stopGame: (): Promise<boolean> => ipcRenderer.invoke('game:stop'),
  isGameRunning: (): Promise<boolean> => ipcRenderer.invoke('game:running'),
  findJava: (): Promise<{ path: string; major: number } | null> => ipcRenderer.invoke('java:find'),
  downloadJava: (major: number): Promise<{ path: string; major: number }> =>
    ipcRenderer.invoke('java:download', major),
  onJavaProgress: (cb: (info: { received: number; total: number }) => void): void => {
    ipcRenderer.on('java:progress', (_event, info) => cb(info))
  },
  offJavaProgress: (): void => {
    ipcRenderer.removeAllListeners('java:progress')
  },
  onGameProgress: (cb: (info: { phase: string; done: number; total: number }) => void): void => {
    ipcRenderer.on('game:progress', (_event, info) => cb(info))
  },
  onGameLog: (cb: (line: string) => void): void => {
    ipcRenderer.on('game:log', (_event, line: string) => cb(line))
  },
  offGameEvents: (): void => {
    ipcRenderer.removeAllListeners('game:progress')
    ipcRenderer.removeAllListeners('game:log')
  },

  searchMods: (source: string, query: string, opts: Record<string, unknown>): Promise<unknown[]> =>
    ipcRenderer.invoke('mods:search', source, query, opts),
  getModVersions: (source: string, projectId: string, opts: Record<string, unknown>): Promise<unknown[]> =>
    ipcRenderer.invoke('mods:versions', source, projectId, opts),
  installMod: (
    instanceName: string,
    source: 'modrinth' | 'curseforge' | 'url',
    projectId: string | undefined,
    file: { url: string; filename: string; size?: number },
    subdir: string
  ): Promise<string> => ipcRenderer.invoke('mods:install', instanceName, source, projectId, file, subdir),
  installModpack: (
    source: 'modrinth' | 'curseforge',
    url: string,
    title: string
  ): Promise<{ instance: LauncherInstance; skipped: number }> =>
    ipcRenderer.invoke('modpacks:install', source, url, title),
  listContent: (instanceName: string, subdir: string): Promise<string[]> =>
    ipcRenderer.invoke('content:list', instanceName, subdir),
  removeContent: (instanceName: string, subdir: string, filename: string): Promise<string[]> =>
    ipcRenderer.invoke('content:remove', instanceName, subdir, filename),

  listInstances: (): Promise<LauncherInstance[]> => ipcRenderer.invoke('instances:list'),
  createInstance: (opts: {
    name: string
    displayName?: string
    versionId: string
    loader?: InstanceLoaderInfo
    source?: string
  }): Promise<LauncherInstance> => ipcRenderer.invoke('instances:create', opts),
  updateInstance: (name: string, patch: Partial<LauncherInstance>): Promise<LauncherInstance | null> =>
    ipcRenderer.invoke('instances:update', name, patch),
  deleteInstance: (name: string): Promise<LauncherInstance[]> => ipcRenderer.invoke('instances:delete', name),
  openInstanceFolder: (name: string): Promise<string> => ipcRenderer.invoke('instance:openFolder', name),

  scanImportable: (): Promise<ImportableInstance[]> => ipcRenderer.invoke('import:scan'),
  importPrism: (info: ImportableInstance): Promise<LauncherInstance> => ipcRenderer.invoke('import:prism', info),

  listTrackedMods: (name: string): Promise<TrackedMod[]> => ipcRenderer.invoke('modpack:tracked', name),
  exportModpack: (name: string): Promise<ModpackManifestInfo> => ipcRenderer.invoke('modpack:export', name),
  importModpack: (manifest: ModpackManifestInfo, newName: string): Promise<LauncherInstance> =>
    ipcRenderer.invoke('modpack:import', manifest, newName),
  onModpackProgress: (cb: (info: { done: number; total: number }) => void): (() => void) => {
    const listener = (_event: unknown, info: { done: number; total: number }): void => cb(info)
    ipcRenderer.on('modpack:progress', listener)
    return () => ipcRenderer.removeListener('modpack:progress', listener)
  },
  offModpackProgress: (): void => {
    ipcRenderer.removeAllListeners('modpack:progress')
  },

  getFriendIdentity: (): Promise<FriendIdentity | null> => ipcRenderer.invoke('friends:identity'),
  registerFriend: (username: string): Promise<FriendIdentity> => ipcRenderer.invoke('friends:register', username),
  logoutFriend: (): Promise<boolean> => ipcRenderer.invoke('friends:logout'),
  getFriendProfile: (): Promise<{ userId: string; username: string; friendCode: string; friends: number }> =>
    ipcRenderer.invoke('friends:me'),
  listFriends: (): Promise<FriendInfo[]> => ipcRenderer.invoke('friends:list'),
  addFriend: (friendCode: string): Promise<FriendInfo[]> => ipcRenderer.invoke('friends:add', friendCode),
  removeFriend: (userId: string): Promise<FriendInfo[]> => ipcRenderer.invoke('friends:remove', userId),
  connectFriends: (): Promise<boolean> => ipcRenderer.invoke('friends:connect'),
  disconnectFriends: (): Promise<boolean> => ipcRenderer.invoke('friends:disconnect'),
  setPresenceStatus: (status: PresenceStatus): Promise<boolean> => ipcRenderer.invoke('friends:setStatus', status),
  getWorlds: (): Promise<WorldInfo[]> => ipcRenderer.invoke('friends:worlds'),
  shareInstance: (instanceName: string): Promise<string> => ipcRenderer.invoke('friends:share', instanceName),
  fetchSharedModpack: (code: string): Promise<SharedModpack> => ipcRenderer.invoke('friends:fetchModpack', code),
  importSharedModpack: (code: string, newName: string): Promise<LauncherInstance> =>
    ipcRenderer.invoke('friends:importModpack', code, newName),
  hostWorld: (opts: { port: number; versionId?: string | null; instanceName?: string | null }): Promise<{ session: string; port: number }> =>
    ipcRenderer.invoke('friends:host', opts),
  stopHosting: (): Promise<boolean> => ipcRenderer.invoke('friends:stopHost'),
  getHostState: (): Promise<{ session: string; port: number } | null> => ipcRenderer.invoke('friends:hostState'),
  joinWorld: (session: string): Promise<{ localPort: number }> => ipcRenderer.invoke('friends:join', session),
  stopJoining: (): Promise<boolean> => ipcRenderer.invoke('friends:stopJoin'),
  getGuestState: (): Promise<{ localPort: number } | null> => ipcRenderer.invoke('friends:guestState'),
  onFriendsList: (cb: (friends: FriendInfo[]) => void): void => {
    ipcRenderer.on('friends:list', (_event, friends) => cb(friends))
  },
  onPresence: (cb: (info: FriendInfo) => void): void => {
    ipcRenderer.on('friends:presence', (_event, info) => cb(info))
  },
  onWorld: (cb: (info: WorldInfo) => void): void => {
    ipcRenderer.on('friends:world', (_event, info) => cb(info))
  },
  onFriendsConnection: (cb: (info: { connected: boolean }) => void): void => {
    ipcRenderer.on('friends:connection', (_event, info) => cb(info))
  },
  onFriendsSessionExpired: (cb: () => void): void => {
    ipcRenderer.on('friends:session-expired', () => cb())
  },
  onHosting: (cb: (info: { session: string; port: number } | null) => void): void => {
    ipcRenderer.on('friends:hosting', (_event, info) => cb(info))
  },
  onJoined: (cb: (info: { localPort: number } | null) => void): void => {
    ipcRenderer.on('friends:joined', (_event, info) => cb(info))
  },
  offFriendsEvents: (): void => {
    for (const ch of ['friends:list', 'friends:presence', 'friends:world', 'friends:connection', 'friends:hosting', 'friends:joined', 'friends:session-expired']) {
      ipcRenderer.removeAllListeners(ch)
    }
  },

  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<unknown> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (status: UpdateStatus) => void): void => {
    ipcRenderer.on('update:status', (_event, status) => cb(status))
  },
  offUpdateStatus: (): void => {
    ipcRenderer.removeAllListeners('update:status')
  },

  getLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke('logs:get'),
  clearLogs: (): Promise<boolean> => ipcRenderer.invoke('logs:clear'),
  saveLogs: (): Promise<string | null> => ipcRenderer.invoke('logs:save'),
  onLog: (cb: (entry: LogEntry) => void): (() => void) => {
    const listener = (_event: unknown, entry: LogEntry): void => cb(entry)
    ipcRenderer.on('logs:append', listener)
    return () => ipcRenderer.removeListener('logs:append', listener)
  },
  onLogsCleared: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('logs:cleared', listener)
    return () => ipcRenderer.removeListener('logs:cleared', listener)
  }
}

export type LauncherApi = typeof api

contextBridge.exposeInMainWorld('launcher', api)