/// <reference types="vite/client" />

interface MsPrompt {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
  message?: string
}

interface LauncherAccount {
  type: 'microsoft' | 'authlib' | 'offline'
  id: string
  uuid: string
  username: string
  [key: string]: unknown
}

interface ModProject {
  source: 'modrinth' | 'curseforge'
  id: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  iconUrl?: string
  categories: string[]
}

interface ModFile {
  id: string
  name: string
  filename: string
  url: string
  size: number
  version: string
  releaseType?: string
}

interface InstanceLoader {
  type: 'fabric' | 'forge' | 'neoforge' | 'quilt'
  version: string
}

interface LauncherInstance {
  name: string
  displayName: string
  versionId: string
  loader?: InstanceLoader
  memoryMb?: number
  createdAt: number
  lastPlayed?: number
  source?: string
}

interface ImportableInstance {
  path: string
  name: string
  versionId: string
  loader?: InstanceLoader
  flamePackId?: string
  flameFileId?: string
}

interface TrackedMod {
  source: 'modrinth' | 'curseforge' | 'url'
  projectId?: string
  filename: string
  url: string
  subdir: string
  size?: number
}

interface ModpackManifest {
  format: 1
  name: string
  versionId: string
  loader?: InstanceLoader
  files: TrackedMod[]
  configZip?: string
  createdAt: number
}

interface FriendIdentity {
  userId: string
  username: string
  token: string
  friendCode: string
}

interface FriendInfo {
  userId: string
  username: string
  friendCode: string
  online: boolean
  status: string
  versionId: string | null
  instanceName: string | null
  loader: InstanceLoader | null
}

interface WorldInfo {
  userId: string
  username: string
  session: string
  hosting: boolean
  port: number | null
  versionId: string | null
  instanceName: string | null
}

interface PresenceStatus {
  status: 'online' | 'in-game' | 'away'
  versionId?: string | null
  instanceName?: string | null
  loader?: InstanceLoader | null
}

interface SharedModpack {
  manifest: ModpackManifest
  ownerUsername: string
  createdAt: number
}

interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error' | 'dev'
  version?: string
  percent?: number
  message?: string
}

interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'debug' | 'game'
  source: string
  message: string
}

interface Window {
  launcher: {
    platform: string
    getAppVersion(): Promise<string>
    copyText(text: string): Promise<void>
    getSettings(): Promise<Record<string, unknown>>
    setSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>>
    testProxy(endpoint?: Record<string, unknown>): Promise<{ ok: boolean; latency: number; status: number }>
    proxyStatus(): Promise<{ mode: string; count: number; active: string | null; lastRefresh: number }>
    refreshProxyPool(): Promise<{ count: number; active: string | null; lastRefresh: number }>
    listAccounts(): Promise<LauncherAccount[]>
    getActiveAccount(): Promise<LauncherAccount | null>
    setActiveAccount(id: string): Promise<LauncherAccount | null>
    removeAccount(id: string): Promise<LauncherAccount[]>
    addOfflineAccount(username: string): Promise<LauncherAccount>
    getAccountHead(id: string): Promise<string | null>
    loginMicrosoft(): Promise<LauncherAccount>
    cancelMicrosoft(): Promise<boolean>
    loginAuthlib(serverUrl: string, username: string, password: string): Promise<LauncherAccount>
    onMsPrompt(cb: (prompt: MsPrompt) => void): () => void
    offMsPrompt(): void
    listVersions(type?: string): Promise<{
      latest: { release: string; snapshot: string }
      versions: { id: string; type: string; releaseTime: string }[]
    }>
    launchGame(req: { versionId: string; instanceName: string }): Promise<number>
    stopGame(): Promise<boolean>
    isGameRunning(): Promise<boolean>
    findJava(): Promise<{ path: string; major: number } | null>
    downloadJava(major: number): Promise<{ path: string; major: number }>
    onJavaProgress(cb: (info: { received: number; total: number }) => void): void
    offJavaProgress(): void
    onGameProgress(cb: (info: { phase: string; done: number; total: number }) => void): void
    onGameLog(cb: (line: string) => void): void
    offGameEvents(): void
    searchMods(source: string, query: string, opts: Record<string, unknown>): Promise<ModProject[]>
    getModVersions(source: string, projectId: string, opts: Record<string, unknown>): Promise<ModFile[]>
    installMod(
      instanceName: string,
      source: 'modrinth' | 'curseforge' | 'url',
      projectId: string | undefined,
      file: { url: string; filename: string; size?: number },
      subdir: string
    ): Promise<string>
    installModpack(
      source: 'modrinth' | 'curseforge',
      url: string,
      title: string
    ): Promise<{ instance: LauncherInstance; skipped: number }>
    listContent(instanceName: string, subdir: string): Promise<string[]>
    removeContent(instanceName: string, subdir: string, filename: string): Promise<string[]>
    listInstances(): Promise<LauncherInstance[]>
    createInstance(opts: {
      name: string
      displayName?: string
      versionId: string
      loader?: InstanceLoader
      source?: string
    }): Promise<LauncherInstance>
    updateInstance(name: string, patch: Partial<LauncherInstance>): Promise<LauncherInstance | null>
    deleteInstance(name: string): Promise<LauncherInstance[]>
    openInstanceFolder(name: string): Promise<string>
    scanImportable(): Promise<ImportableInstance[]>
    importPrism(info: ImportableInstance): Promise<LauncherInstance>
    listTrackedMods(name: string): Promise<TrackedMod[]>
    exportModpack(name: string): Promise<ModpackManifest>
    importModpack(manifest: ModpackManifest, newName: string): Promise<LauncherInstance>
    onModpackProgress(cb: (info: { done: number; total: number }) => void): () => void
    offModpackProgress(): void
    getFriendIdentity(): Promise<FriendIdentity | null>
    registerFriend(username: string): Promise<FriendIdentity>
    logoutFriend(): Promise<boolean>
    getFriendProfile(): Promise<{ userId: string; username: string; friendCode: string; friends: number }>
    listFriends(): Promise<FriendInfo[]>
    addFriend(friendCode: string): Promise<FriendInfo[]>
    removeFriend(userId: string): Promise<FriendInfo[]>
    connectFriends(): Promise<boolean>
    disconnectFriends(): Promise<boolean>
    setPresenceStatus(status: PresenceStatus): Promise<boolean>
    getWorlds(): Promise<WorldInfo[]>
    shareInstance(instanceName: string): Promise<string>
    fetchSharedModpack(code: string): Promise<SharedModpack>
    importSharedModpack(code: string, newName: string): Promise<LauncherInstance>
    hostWorld(opts: { port: number; versionId?: string | null; instanceName?: string | null }): Promise<{ session: string; port: number }>
    stopHosting(): Promise<boolean>
    getHostState(): Promise<{ session: string; port: number } | null>
    joinWorld(session: string): Promise<{ localPort: number }>
    stopJoining(): Promise<boolean>
    getGuestState(): Promise<{ localPort: number } | null>
    onFriendsList(cb: (friends: FriendInfo[]) => void): void
    onPresence(cb: (info: FriendInfo) => void): void
    onWorld(cb: (info: WorldInfo) => void): void
    onFriendsConnection(cb: (info: { connected: boolean }) => void): void
    onFriendsSessionExpired(cb: () => void): void
    onHosting(cb: (info: { session: string; port: number } | null) => void): void
    onJoined(cb: (info: { localPort: number } | null) => void): void
    offFriendsEvents(): void
    checkForUpdates(): Promise<unknown>
    downloadUpdate(): Promise<unknown>
    installUpdate(): Promise<boolean>
    onUpdateStatus(cb: (status: UpdateStatus) => void): void
    offUpdateStatus(): void
    getLogs(): Promise<LogEntry[]>
    clearLogs(): Promise<boolean>
    saveLogs(): Promise<string | null>
    onLog(cb: (entry: LogEntry) => void): () => void
    onLogsCleared(cb: () => void): () => void
  }
}