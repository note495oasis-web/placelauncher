import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { apiJson, download } from '../net/http'
import { upsertAccount, type AuthlibAccount } from './accounts'

export const ELY_BY = 'https://authserver.ely.by'

interface YggdrasilAuthResponse {
  accessToken: string
  clientToken: string
  selectedProfile?: { id: string; name: string }
}

export async function loginAuthlib(
  serverUrl: string,
  username: string,
  password: string
): Promise<AuthlibAccount> {
  const base = serverUrl.replace(/\/+$/, '')
  if (!username || !password) throw new Error('Укажите логин и пароль')
  const res = await apiJson<YggdrasilAuthResponse>(`${base}/auth/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      requestUser: true,
      agent: { name: 'Minecraft', version: 1 }
    })
  })
  if (!res.selectedProfile) throw new Error('Сервер не вернул профиль. Проверьте логин/пароль.')
  const acc: AuthlibAccount = {
    type: 'authlib',
    id: `${base}:${res.selectedProfile.id}`,
    uuid: res.selectedProfile.id,
    username: res.selectedProfile.name,
    serverUrl: base,
    accessToken: res.accessToken,
    clientToken: res.clientToken
  }
  upsertAccount(acc)
  return acc
}

export async function refreshAuthlib(acc: AuthlibAccount): Promise<AuthlibAccount> {
  const res = await apiJson<{ accessToken: string; clientToken: string }>(`${acc.serverUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: acc.accessToken, clientToken: acc.clientToken, requestUser: true })
  })
  const next: AuthlibAccount = { ...acc, accessToken: res.accessToken, clientToken: res.clientToken }
  upsertAccount(next)
  return next
}

export async function ensureAuthlibInjector(cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true })
  const dest = join(cacheDir, 'authlib-injector.jar')
  if (existsSync(dest)) return dest
  const release = await apiJson<{ assets: { name: string; browser_download_url: string }[] }>(
    'https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest',
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'placelauncher' } }
  )
  const asset = release.assets.find((a) => a.name.endsWith('.jar'))
  if (!asset) throw new Error('Не найден jar authlib-injector в последнем релизе')
  await download(asset.browser_download_url, dest)
  return dest
}