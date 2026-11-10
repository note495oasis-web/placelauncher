import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, randomUUID } from 'crypto'

const DATA_FILE = process.env.DATA_FILE || fileURLToPath(new URL('./data.json', import.meta.url))
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function emptyData() {
  return { users: {}, tokens: {}, friendCodes: {}, usernames: {}, modpacks: {} }
}

let data = emptyData()

export function load() {
  try {
    if (existsSync(DATA_FILE)) {
      data = { ...emptyData(), ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) }
    }
  } catch {
    data = emptyData()
  }
}

let saveTimer = null
export function save() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true })
      const tmp = DATA_FILE + '.tmp'
      writeFileSync(tmp, JSON.stringify(data))
      renameSync(tmp, DATA_FILE)
    } catch (err) {
      console.error('store save failed:', err.message)
    }
  }, 250)
}

export function currentWeek() {
  return Math.floor(Date.now() / WEEK_MS)
}

function shortCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = randomBytes(len)
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export function registerUser(username) {
  const lower = username.toLowerCase()
  if (data.usernames[lower]) throw new Error('Это имя уже занято.')
  const userId = randomUUID()
  const token = randomBytes(24).toString('hex')
  let friendCode = shortCode()
  while (data.friendCodes[friendCode]) friendCode = shortCode()
  const user = {
    userId,
    username,
    token,
    friendCode,
    friends: [],
    createdAt: Date.now(),
    uploads: { week: currentWeek(), count: 0 },
    imports: { week: currentWeek(), count: 0 }
  }
  data.users[userId] = user
  data.tokens[token] = userId
  data.friendCodes[friendCode] = userId
  data.usernames[lower] = userId
  save()
  return user
}

export function userByToken(token) {
  const userId = data.tokens[token]
  return userId ? data.users[userId] : null
}

export function userById(userId) {
  return data.users[userId] || null
}

export function userByFriendCode(code) {
  const userId = data.friendCodes[code?.toUpperCase()]
  return userId ? data.users[userId] : null
}

export function addFriend(user, friend) {
  if (user.userId === friend.userId) throw new Error('Нельзя добавить самого себя.')
  if (!user.friends.includes(friend.userId)) user.friends.push(friend.userId)
  if (!friend.friends.includes(user.userId)) friend.friends.push(user.userId)
  save()
}

export function removeFriend(user, friendId) {
  user.friends = user.friends.filter((id) => id !== friendId)
  const friend = data.users[friendId]
  if (friend) friend.friends = friend.friends.filter((id) => id !== user.userId)
  save()
}

function bumpCounter(user, key, limit) {
  const week = currentWeek()
  const c = user[key]
  if (c.week !== week) {
    c.week = week
    c.count = 0
  }
  if (c.count >= limit) {
    const err = new Error('Достигнут лимит на эту неделю. Попробуйте позже.')
    err.code = 'RATE_LIMIT'
    throw err
  }
  c.count++
  save()
}

export function storeModpack(user, manifest, uploadLimit) {
  bumpCounter(user, 'uploads', uploadLimit)
  let code = shortCode()
  while (data.modpacks[code]) code = shortCode()
  data.modpacks[code] = { code, ownerId: user.userId, manifest, createdAt: Date.now() }
  save()
  return code
}

export function getModpack(code, user, importLimit) {
  const pack = data.modpacks[code?.toUpperCase()]
  if (!pack) return null
  if (pack.ownerId !== user.userId) bumpCounter(user, 'imports', importLimit)
  const owner = data.users[pack.ownerId]
  return { manifest: pack.manifest, ownerUsername: owner?.username ?? 'unknown', createdAt: pack.createdAt }
}

export function publicUser(user) {
  return { userId: user.userId, username: user.username, friendCode: user.friendCode }
}