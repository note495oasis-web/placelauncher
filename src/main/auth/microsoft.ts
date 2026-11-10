import { apiJson, apiRequest } from '../net/http'
import { upsertAccount, type MicrosoftAccount } from './accounts'

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const SCOPE = 'XboxLive.signin offline_access'
// Public client ID from Prism Launcher's open build config; using it accepts MS Identity Platform terms.
export const DEFAULT_MS_CLIENT_ID = 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb'
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' }
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }

export interface MsPrompt {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
  message?: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function form(obj: Record<string, string>): string {
  return new URLSearchParams(obj).toString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function loginWithDeviceCode(
  clientId: string,
  onPrompt: (p: MsPrompt) => void,
  signal?: AbortSignal
): Promise<MicrosoftAccount> {
  clientId = clientId.trim() || DEFAULT_MS_CLIENT_ID

  const dcRes = await apiRequest(DEVICE_CODE_URL, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ client_id: clientId, scope: SCOPE })
  })
  const dc = JSON.parse(dcRes.body.toString('utf8'))
  if (dcRes.status !== 200) throw new Error(dc.error_description || 'Не удалось запросить код устройства')

  onPrompt({
    userCode: dc.user_code,
    verificationUri: dc.verification_uri,
    expiresIn: dc.expires_in,
    interval: dc.interval,
    message: dc.message
  })

  const intervalMs = Math.max(1, dc.interval || 5) * 1000
  const deadline = Date.now() + (dc.expires_in || 900) * 1000
  let tokens: TokenResponse | null = null

  while (Date.now() < deadline) {
    await sleep(intervalMs)
    if (signal?.aborted) throw new Error('Вход отменён.')
    const res = await apiRequest(TOKEN_URL, {
      method: 'POST',
      headers: FORM_HEADERS,
      body: form({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: dc.device_code
      })
    })
    const body = JSON.parse(res.body.toString('utf8'))
    if (res.status === 200) {
      tokens = body as TokenResponse
      break
    }
    if (body.error === 'authorization_pending') continue
    if (body.error === 'slow_down') {
      await sleep(intervalMs)
      continue
    }
    throw new Error(body.error_description || body.error || 'Авторизация отклонена')
  }

  if (!tokens) throw new Error('Время ожидания авторизации истекло. Попробуйте снова.')
  return finishLogin(tokens.access_token, tokens.refresh_token ?? '')
}

async function finishLogin(msAccessToken: string, refreshToken: string): Promise<MicrosoftAccount> {
  const xbl = await apiJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      })
    }
  )
  const uhs = xbl.DisplayClaims.xui[0].uhs

  const xstsRes = await apiRequest('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })
  const xsts = JSON.parse(xstsRes.body.toString('utf8'))
  if (xstsRes.status !== 200) {
    if (xsts.XErr === 2148916233) throw new Error('У аккаунта нет профиля Xbox. Создайте его на xbox.com и повторите.')
    if (xsts.XErr === 2148916238) throw new Error('Детский аккаунт. Добавьте его в семью Microsoft и повторите.')
    throw new Error(`Ошибка Xbox XSTS: ${xsts.XErr ?? xstsRes.status}`)
  }

  const mc = await apiJson<{ access_token: string; expires_in: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xsts.Token}` }) }
  )

  const profRes = await apiRequest('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}` }
  })
  if (profRes.status === 404) throw new Error('На этом аккаунте нет купленной Minecraft Java Edition.')
  if (profRes.status !== 200) throw new Error(`Не удалось получить профиль Minecraft (${profRes.status})`)
  const profile = JSON.parse(profRes.body.toString('utf8')) as { id: string; name: string }

  const acc: MicrosoftAccount = {
    type: 'microsoft',
    id: profile.id,
    uuid: profile.id,
    username: profile.name,
    mcToken: mc.access_token,
    refreshToken,
    expiresAt: Date.now() + (mc.expires_in || 86400) * 1000
  }
  upsertAccount(acc)
  return acc
}

export async function refreshMicrosoft(acc: MicrosoftAccount, clientId: string): Promise<MicrosoftAccount> {
  clientId = clientId.trim() || DEFAULT_MS_CLIENT_ID
  const res = await apiRequest(TOKEN_URL, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: acc.refreshToken,
      scope: SCOPE
    })
  })
  const body = JSON.parse(res.body.toString('utf8'))
  if (res.status !== 200) throw new Error('Сессия Microsoft истекла. Войдите заново.')
  return finishLogin(body.access_token, body.refresh_token ?? acc.refreshToken)
}