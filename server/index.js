import http from 'http'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import * as store from './store.js'

const PORT = Number(process.env.PORT || 8080)
const UPLOADS_PER_WEEK = Number(process.env.UPLOADS_PER_WEEK || 5)
const IMPORTS_PER_WEEK = Number(process.env.IMPORTS_PER_WEEK || 20)
const MAX_MANIFEST_BYTES = Number(process.env.MAX_MANIFEST_BYTES || 5 * 1024 * 1024)

store.load()

const app = express()
app.use(express.json({ limit: '8mb' }))
app.disable('x-powered-by')

// userId -> { ws, status, versionId, instanceName, loader }
const presence = new Map()
// session -> { ws (control), userId, port, versionId, instanceName }
const hosts = new Map()
// "session|channel" -> { host?: WebSocket, guest?: WebSocket }
const channels = new Map()

function sendJson(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

function friendsWithPresence(user) {
  return user.friends.map((id) => {
    const f = store.userById(id)
    if (!f) return null
    const p = presence.get(id)
    return {
      ...store.publicUser(f),
      online: !!p,
      status: p?.status ?? 'offline',
      versionId: p?.versionId ?? null,
      instanceName: p?.instanceName ?? null,
      loader: p?.loader ?? null
    }
  }).filter(Boolean)
}

function broadcastToFriends(user, obj) {
  const msg = JSON.stringify(obj)
  for (const id of user.friends) {
    const p = presence.get(id)
    if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(msg)
  }
}

function presencePayload(user) {
  const p = presence.get(user.userId)
  return {
    type: 'presence',
    userId: user.userId,
    username: user.username,
    online: !!p,
    status: p?.status ?? 'offline',
    versionId: p?.versionId ?? null,
    instanceName: p?.instanceName ?? null,
    loader: p?.loader ?? null
  }
}

// ---------- HTTP API ----------
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), online: presence.size, hosting: hosts.size })
})

const registerHits = new Map()
app.post('/api/register', (req, res) => {
  const ip = req.ip
  const now = Date.now()
  const hits = (registerHits.get(ip) || []).filter((t) => now - t < 3600_000)
  if (hits.length >= 10) return res.status(429).json({ error: 'Слишком много регистраций с этого адреса.' })
  hits.push(now)
  registerHits.set(ip, hits)

  const username = String(req.body?.username ?? '').trim()
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Имя: 3-24 символа, латиница, цифры и _.' })
  }
  try {
    const user = store.registerUser(username)
    res.json({ userId: user.userId, token: user.token, friendCode: user.friendCode, username: user.username })
  } catch (err) {
    res.status(409).json({ error: err.message })
  }
})

app.use('/api', (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const user = token ? store.userByToken(token) : null
  if (!user) return res.status(401).json({ error: 'Недействительный токен.' })
  req.user = user
  next()
})

app.get('/api/me', (req, res) => {
  res.json({ ...store.publicUser(req.user), friends: req.user.friends.length })
})

app.get('/api/friends', (req, res) => {
  res.json(friendsWithPresence(req.user))
})

app.post('/api/friends', (req, res) => {
  const friend = store.userByFriendCode(String(req.body?.friendCode ?? ''))
  if (!friend) return res.status(404).json({ error: 'Код друга не найден.' })
  try {
    store.addFriend(req.user, friend)
    res.json(friendsWithPresence(req.user))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.delete('/api/friends/:userId', (req, res) => {
  store.removeFriend(req.user, req.params.userId)
  res.json(friendsWithPresence(req.user))
})

app.post('/api/modpacks', (req, res) => {
  const manifest = req.body?.manifest
  if (!manifest || manifest.format !== 1 || !manifest.versionId || !Array.isArray(manifest.files)) {
    return res.status(400).json({ error: 'Некорректный манифест сборки.' })
  }
  if (Buffer.byteLength(JSON.stringify(manifest)) > MAX_MANIFEST_BYTES) {
    return res.status(413).json({ error: 'Манифест слишком большой.' })
  }
  try {
    const code = store.storeModpack(req.user, manifest, UPLOADS_PER_WEEK)
    res.json({ code })
  } catch (err) {
    res.status(err.code === 'RATE_LIMIT' ? 429 : 500).json({ error: err.message })
  }
})

app.get('/api/modpacks/:code', (req, res) => {
  try {
    const pack = store.getModpack(req.params.code, req.user, IMPORTS_PER_WEEK)
    if (!pack) return res.status(404).json({ error: 'Сборка не найдена.' })
    res.json(pack)
  } catch (err) {
    res.status(err.code === 'RATE_LIMIT' ? 429 : 500).json({ error: err.message })
  }
})

// ---------- WebSocket ----------
const server = http.createServer(app)
const wssPresence = new WebSocketServer({ noServer: true })
const wssControl = new WebSocketServer({ noServer: true })
const wssData = new WebSocketServer({ noServer: true })

function tokenFromUrl(url) {
  return url.searchParams.get('token')
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  const user = store.userByToken(tokenFromUrl(url))
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  req.authUser = user
  const done = (wss) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  if (url.pathname === '/ws') done(wssPresence)
  else if (url.pathname === '/tunnel/control') done(wssControl)
  else if (url.pathname === '/tunnel/data') done(wssData)
  else socket.destroy()
})

wssPresence.on('connection', (ws, req) => {
  const user = req.authUser
  const old = presence.get(user.userId)
  if (old && old.ws !== ws) old.ws.close()
  presence.set(user.userId, { ws, status: 'online' })
  sendJson(ws, { type: 'friends', friends: friendsWithPresence(user) })
  broadcastToFriends(user, presencePayload(user))

  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (msg.type === 'status') {
      const entry = presence.get(user.userId)
      if (!entry) return
      entry.status = ['online', 'in-game', 'away'].includes(msg.status) ? msg.status : 'online'
      entry.versionId = typeof msg.versionId === 'string' ? msg.versionId : null
      entry.instanceName = typeof msg.instanceName === 'string' ? msg.instanceName : null
      entry.loader = msg.loader ?? null
      broadcastToFriends(user, presencePayload(user))
    }
  })
  ws.on('close', () => {
    const entry = presence.get(user.userId)
    if (entry && entry.ws === ws) {
      presence.delete(user.userId)
      broadcastToFriends(user, presencePayload(user))
    }
  })
})

function stopHosting(session) {
  const h = hosts.get(session)
  if (!h) return
  hosts.delete(session)
  const owner = store.userById(h.userId)
  if (owner) {
    broadcastToFriends(owner, {
      type: 'world', userId: h.userId, username: owner.username,
      session, hosting: false, port: null, versionId: null, instanceName: null
    })
  }
  for (const key of [...channels.keys()]) {
    if (key.startsWith(session + '|')) {
      const c = channels.get(key)
      c?.host?.close()
      c?.guest?.close()
      channels.delete(key)
    }
  }
}

wssControl.on('connection', (ws, req) => {
  const user = req.authUser
  let mySession = null
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (msg.type === 'host' && typeof msg.session === 'string' && Number.isInteger(msg.port)) {
      if (mySession && mySession !== msg.session) stopHosting(mySession)
      mySession = msg.session
      hosts.set(mySession, {
        ws, userId: user.userId, port: msg.port,
        versionId: msg.versionId ?? null, instanceName: msg.instanceName ?? null
      })
      sendJson(ws, { type: 'hosting', session: mySession })
      broadcastToFriends(user, {
        type: 'world', userId: user.userId, username: user.username,
        session: mySession, hosting: true, port: msg.port,
        versionId: msg.versionId ?? null, instanceName: msg.instanceName ?? null
      })
    } else if (msg.type === 'stop' && mySession) {
      stopHosting(mySession)
      mySession = null
    }
  })
  ws.on('close', () => {
    if (mySession) stopHosting(mySession)
  })
})

function relay(src, dst) {
  src.on('message', (data) => {
    if (dst.readyState !== WebSocket.OPEN) return
    dst.send(data)
    if (dst.bufferedAmount > 4 * 1024 * 1024 && src._socket) src._socket.pause()
  })
  if (dst._socket) dst._socket.on('drain', () => src._socket && src._socket.resume())
}

function tryPipe(key) {
  const c = channels.get(key)
  if (c && c.host && c.guest && c.host.readyState === WebSocket.OPEN && c.guest.readyState === WebSocket.OPEN) {
    relay(c.host, c.guest)
    relay(c.guest, c.host)
  }
}

wssData.on('connection', (ws, req) => {
  const user = req.authUser
  const url = new URL(req.url, 'http://localhost')
  const session = url.searchParams.get('session')
  const channel = url.searchParams.get('channel')
  const role = url.searchParams.get('role')
  if (!session || !channel || (role !== 'host' && role !== 'guest')) {
    ws.close()
    return
  }
  if (role === 'host') {
    const h = hosts.get(session)
    if (!h || h.userId !== user.userId) { ws.close(); return }
  }
  const key = session + '|' + channel
  const entry = channels.get(key) || {}
  entry[role] = ws
  channels.set(key, entry)
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })

  if (role === 'guest') {
    const h = hosts.get(session)
    if (h) sendJson(h.ws, { type: 'join', channel })
    else { ws.close(); channels.delete(key); return }
  }
  tryPipe(key)

  ws.on('close', () => {
    const c = channels.get(key)
    if (!c) return
    const other = role === 'host' ? c.guest : c.host
    if (other) other.close()
    channels.delete(key)
  })
})

const heartbeat = setInterval(() => {
  for (const wss of [wssPresence, wssControl, wssData]) {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue }
      ws.isAlive = false
      ws.ping()
    }
  }
}, 30_000)

server.on('close', () => clearInterval(heartbeat))
server.listen(PORT, () => {
  console.log(`Aurora friends server listening on :${PORT}`)
  console.log(`Limits: uploads=${UPLOADS_PER_WEEK}/week imports=${IMPORTS_PER_WEEK}/week`)
})