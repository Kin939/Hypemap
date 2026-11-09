/**
 * Локальный стенд: отдаёт собранный фронтенд (web/dist), мок REST API плагина,
 * мок Dynmap (/up, /tiles) и сгенерированные демо-тайлы.
 *
 * Запуск:
 *   cd web && npm run build && npm run mock      # http://localhost:8080
 *
 * Логин админки: admin / admin (только для стенда!).
 */
import http from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { avatarPng } from './avatar.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '../dist')
const TILES = path.resolve(__dirname, 'tiles')
const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'

/* ------------------------------------------------------------------ данные */

const now = () => Date.now()
const iso = (ms) => new Date(ms).toISOString()

const demoPlayers = [
  { name: 'Elyra', x: 136, z: 136, radius: 24, speed: 0.00042, phase: 0.3, y: 72 },
  { name: 'Kraft', x: 340, z: 310, radius: 30, speed: -0.00035, phase: 1.7, y: 68 },
  { name: 'Mira', x: 428, z: 128, radius: 22, speed: 0.0005, phase: 3.1, y: 66 },
  { name: 'Sova', x: 250, z: 240, radius: 46, speed: 0.00028, phase: 4.4, y: 74 },
  { name: 'Drev', x: 300, z: 400, radius: 18, speed: 0.0006, phase: 5.2, y: 70 },
]

function playersNow() {
  const t = now()
  return demoPlayers.map((player, index) => {
    const angle = t * player.speed + player.phase
    return {
      type: 'player',
      name: player.name,
      account: player.name,
      world: 'world',
      x: Math.round((player.x + Math.cos(angle) * player.radius) * 10) / 10,
      y: player.y,
      z: Math.round((player.z + Math.sin(angle) * player.radius) * 10) / 10,
      health: 20 - (index % 3),
      armor: index % 2 ? 7 : 0,
      sort: index,
    }
  })
}

const KNOWN_PLAYERS = [
  ...demoPlayers.map((player) => player.name),
  'Alex', 'Steve', 'Herobrine', 'Tessa', 'Notch', 'Arcturus', 'Bolt', 'Cerys', 'Fenrir',
  'Grim', 'Hilda', 'Ivar', 'Jora', 'Kestrel', 'Loki', 'Nyx', 'Orin', 'Pike', 'Quill',
]

const mapConfig = {
  type: 'HDMapType',
  name: 'flat',
  title: 'Поверхность',
  icon: 'world',
  prefix: 'flat',
  background: '#0b1017',
  bigmap: true,
  mapzoomout: 3,
  mapzoomin: 0,
  boostzoom: 0,
  tilescale: 0,
  protected: false,
  'image-format': 'png',
  nightandday: false,
  perspective: 'iso_S_90_lowres',
  // iso_S_90 (scale 4): север сверху, восток справа — как отдаёт настоящий Dynmap
  worldtomap: [4, 0, 0, 0, 0, -4, 0, 1, 0],
  maptoworld: [0.25, 0, 0, 0, 0, 1, 0, -0.25, 0],
}

const configuration = {
  confighash: 912_345,
  updaterate: 2000,
  title: 'Hypemap Demo',
  defaultworld: 'world',
  defaultmap: 'flat',
  maxcount: 40,
  dynmapversion: '3.7-beta-8',
  coreversion: '3.7-beta-8',
  showplayerfacesinmenu: 'true',
  'login-enabled': false,
  worlds: [
    {
      name: 'world',
      title: 'Мир',
      protected: false,
      center: { x: 256, y: 64, z: 256 },
      extrazoomout: 0,
      sealevel: 63,
      worldheight: 320,
      maps: [mapConfig],
    },
  ],
  components: [{ type: 'playermarkers' }, { type: 'markers' }, { type: 'coord' }],
}

const users = [{ username: 'admin', password: 'admin', role: 'ADMIN' }]
const tokens = new Map()
const audit = []
let auditId = 1

function town(overrides) {
  const ts = now() - 1000 * 60 * 60 * 24 * 12
  return {
    id: `t_${Math.random().toString(36).slice(2, 10)}`,
    name: 'Безымянное',
    description: '',
    world: 'world',
    y: 64,
    polygon: [],
    fillColor: '#34d399',
    lineColor: '#10b981',
    fillOpacity: 0.28,
    lineOpacity: 1,
    lineWeight: 2,
    members: [],
    flags: [],
    visible: true,
    minZoom: 0,
    maxZoom: 10,
    icon: '',
    createdAt: ts,
    updatedAt: ts,
    createdBy: 'admin',
    updatedBy: 'admin',
    revision: 1,
    ...overrides,
  }
}

const towns = [
  town({
    name: 'Аурелия',
    description: 'Столица долины: рынок, кузницы и главный портал. Открыта для торговли и путешественников.',
    polygon: [
      { x: 96, z: 122 },
      { x: 148, z: 96 },
      { x: 180, z: 138 },
      { x: 162, z: 186 },
      { x: 108, z: 178 },
    ],
    fillColor: '#38bdf8',
    lineColor: '#0ea5e9',
    members: [
      { name: 'Elyra', role: 'OWNER' },
      { name: 'Kraft', role: 'MEMBER' },
      { name: 'Mira', role: 'MEMBER' },
      { name: 'Sova', role: 'MEMBER' },
    ],
    flags: ['CAPITAL', 'SHOP', 'PUBLIC'],
    createdBy: 'Elyra',
  }),
  town({
    name: 'Каменный Брод',
    description: 'Шахтёрский городок у старого моста. Здесь куют лучшие кирки на сервере.',
    polygon: [
      { x: 296, z: 300 },
      { x: 338, z: 268 },
      { x: 384, z: 302 },
      { x: 372, z: 350 },
      { x: 316, z: 354 },
    ],
    fillColor: '#f59e0b',
    lineColor: '#d97706',
    members: [
      { name: 'Drev', role: 'OWNER' },
      { name: 'Tessa', role: 'MEMBER' },
      { name: 'Grim', role: 'MEMBER' },
    ],
    flags: ['MINING', 'PEACEFUL'],
    createdBy: 'Drev',
  }),
  town({
    name: 'Северный Порт',
    description: 'Порт на реке: склады, доки и единственный в мире маяк из меди.',
    polygon: [
      { x: 392, z: 110 },
      { x: 440, z: 84 },
      { x: 474, z: 122 },
      { x: 452, z: 166 },
      { x: 404, z: 160 },
    ],
    fillColor: '#a78bfa',
    lineColor: '#8b5cf6',
    members: [
      { name: 'Mira', role: 'OWNER' },
      { name: 'Ivar', role: 'MEMBER' },
    ],
    flags: ['PORT', 'PVP'],
    createdBy: 'Mira',
  }),
]

const history = new Map()
for (const item of towns) history.set(item.id, [snapshot(item, 1, 'CREATE', item.createdBy)])

function snapshot(item, revision, action, actor) {
  return {
    townId: item.id,
    revision,
    action,
    actor,
    createdAt: iso(item.updatedAt),
    snapshot: JSON.parse(JSON.stringify({ ...item, revision })),
  }
}

function logAction(actor, action, townId, details) {
  audit.unshift({ id: auditId++, at: iso(now()), actor, action, townId, details })
  audit.length = Math.min(audit.length, 200)
}

/* ------------------------------------------------------------------ helpers */

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  })
  res.end(body)
}

function fail(res, status, code, message) {
  json(res, status, { error: { code, message } })
}

async function readBody(req, limit = 262_144) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('payload_too_large')
    chunks.push(chunk)
  }
  if (!chunks.length) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function bearer(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return tokens.get(header.slice(7)) || null
}

function requireUser(req, res) {
  const user = bearer(req)
  if (!user) {
    fail(res, 401, 'unauthorized', 'Требуется вход')
    return null
  }
  return user
}

function meta(req) {
  const players = playersNow()
  return {
    title: 'Hypemap',
    serverName: 'Hypemap Demo Realm',
    version: '1.0.0',
    apiVersion: 1,
    server: {
      name: 'Hypemap Demo Realm',
      minecraft: '1.21.3',
      online: players.length,
      max: 40,
      worlds: configuration.worlds.map((world) => world.name),
      players: players.map((player) => player.name),
    },
    dynmap: {
      available: true,
      version: '3.7-beta-8',
      markerSetId: 'hypemap.towns',
      url: '',
    },
    auth: { mode: 'LOCAL', localLogin: true, access: false },
    limits: { maxPolygonPoints: 256, maxMembers: 64, minNameLength: 2, maxNameLength: 40, maxBodyBytes: 262144 },
    flags: ['PVP', 'PEACEFUL', 'PUBLIC', 'CAPITAL', 'SHOP', 'FARM', 'MINING', 'PORT'],
    townCount: towns.length,
    defaults: { fillColor: '#22c55e', lineColor: '#16a34a', fillOpacity: 0.28, lineOpacity: 1, lineWeight: 2 },
    discordInvite: '',
  }
}

function sanitizeTown(input, base) {
  const errors = []
  const name = String(input.name ?? base?.name ?? '').trim()
  if (name.length < 2) errors.push('Название короче 2 символов')
  if (name.length > 40) errors.push('Название длиннее 40 символов')
  const polygon = (input.polygon ?? base?.polygon ?? []).map((point) => ({
    x: Math.round(Number(point.x) * 10) / 10,
    z: Math.round(Number(point.z) * 10) / 10,
  }))
  if (polygon.length < 3) errors.push('Нужно минимум 3 вершины')
  if (polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) {
    errors.push('Некорректные координаты')
  }
  const isHex = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || ''))
  if (input.fillColor && !isHex(input.fillColor)) errors.push('Некорректный цвет заливки')
  if (input.lineColor && !isHex(input.lineColor)) errors.push('Некорректный цвет обводки')
  const members = (input.members ?? base?.members ?? []).map((member) => ({
    name: String(member.name).trim(),
    role: member.role === 'OWNER' ? 'OWNER' : 'MEMBER',
  }))
  if (members.length && !members.some((member) => member.role === 'OWNER')) members[0].role = 'OWNER'
  const duplicate = towns.find(
    (item) => item.id !== base?.id && item.name.toLowerCase() === name.toLowerCase(),
  )
  if (duplicate) errors.push('Поселение с таким названием уже существует')
  if (errors.length) return { errors }
  return {
    errors: [],
    value: {
      name,
      description: String(input.description ?? base?.description ?? '').slice(0, 500),
      world: input.world ?? base?.world ?? 'world',
      y: Number(input.y ?? base?.y ?? 64),
      polygon,
      fillColor: (input.fillColor ?? base?.fillColor ?? '#34d399').toLowerCase(),
      lineColor: (input.lineColor ?? base?.lineColor ?? '#10b981').toLowerCase(),
      fillOpacity: Number(input.fillOpacity ?? base?.fillOpacity ?? 0.28),
      lineOpacity: Number(input.lineOpacity ?? base?.lineOpacity ?? 1),
      lineWeight: Number(input.lineWeight ?? base?.lineWeight ?? 2),
      members,
      flags: (input.flags ?? base?.flags ?? []).filter((flag) =>
        ['PVP', 'PEACEFUL', 'PUBLIC', 'CAPITAL', 'SHOP', 'FARM', 'MINING', 'PORT'].includes(flag),
      ),
      visible: input.visible ?? base?.visible ?? true,
      minZoom: Number(input.minZoom ?? base?.minZoom ?? 0),
      maxZoom: Number(input.maxZoom ?? base?.maxZoom ?? 10),
      icon: input.icon ?? base?.icon ?? '',
    },
  }
}

/* --------------------------------------------------------------------- API */

async function handleApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean) // api, ...
  const method = req.method || 'GET'
  const [, resource, id, action] = segments

  if (method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  if (resource === 'health') return json(res, 200, { status: 'ok', towns: towns.length, dynmap: true })
  if (resource === 'meta') return json(res, 200, meta(req))

  if (resource === 'auth') {
    if (id === 'login' && method === 'POST') {
      const body = await readBody(req)
      const user = users.find(
        (candidate) =>
          candidate.username.toLowerCase() === String(body?.username || '').toLowerCase() &&
          candidate.password === body?.password,
      )
      if (!user) return fail(res, 401, 'unauthorized', 'Неверный логин или пароль')
      const token = `mock.${Buffer.from(`${user.username}:${now()}`).toString('base64url')}`
      tokens.set(token, { username: user.username, role: user.role, source: 'local' })
      logAction(user.username, 'auth.login', null, 'demo')
      return json(res, 200, {
        token,
        expiresAt: now() + 12 * 3600 * 1000,
        user: { username: user.username, role: user.role, source: 'local' },
      })
    }
    if (id === 'me' && method === 'GET') {
      const user = bearer(req)
      return json(res, 200, {
        authenticated: !!user,
        user: user || undefined,
        auth: { mode: 'LOCAL', localLogin: true },
      })
    }
    if (id === 'password' && method === 'POST') {
      if (!requireUser(req, res)) return
      const body = await readBody(req)
      const user = bearer(req)
      const record = users.find((candidate) => candidate.username === user.username)
      if (!record || record.password !== body?.currentPassword) {
        return fail(res, 403, 'forbidden', 'Текущий пароль неверен')
      }
      if (String(body?.newPassword || '').length < 8) {
        return fail(res, 400, 'weak_password', 'Пароль должен быть не короче 8 символов')
      }
      record.password = body.newPassword
      return json(res, 200, { status: 'ok' })
    }
    return fail(res, 404, 'not_found', 'Неизвестный маршрут auth')
  }

  if (resource === 'players') {
    const user = bearer(req)
    if (!user) return fail(res, 401, 'unauthorized', 'Требуется вход')
    const query = (url.searchParams.get('q') || '').toLowerCase()
    const limit = Math.min(Number(url.searchParams.get('limit') || 12), 50)
    const list = KNOWN_PLAYERS.filter((name) => name.toLowerCase().includes(query)).slice(0, limit)
    return json(res, 200, { players: list, online: demoPlayers.map((player) => player.name) })
  }

  if (resource === 'audit') {
    if (!requireUser(req, res)) return
    const limit = Math.min(Number(url.searchParams.get('limit') || 40), 200)
    return json(res, 200, { entries: audit.slice(0, limit) })
  }

  if (resource === 'dynmap' && id === 'resync' && method === 'POST') {
    if (!requireUser(req, res)) return
    return json(res, 202, { status: 'queued', available: true })
  }

  if (resource === 'towns') {
    if (!id) {
      if (method === 'GET') {
        const includeHidden = url.searchParams.get('includeHidden') === '1' && !!bearer(req)
        const list = towns
          .filter((item) => includeHidden || item.visible)
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        return json(res, 200, {
          towns: list,
          count: list.length,
          updatedAt: iso(Math.max(0, ...list.map((item) => item.updatedAt))),
          serverTime: iso(now()),
        })
      }
      if (method === 'POST') {
        const user = requireUser(req, res)
        if (!user) return
        const body = await readBody(req)
        const result = sanitizeTown(body || {})
        if (result.errors.length) return fail(res, 400, 'invalid_town', result.errors[0])
        const created = town({
          ...result.value,
          createdAt: now(),
          updatedAt: now(),
          createdBy: user.username,
          updatedBy: user.username,
        })
        towns.push(created)
        history.set(created.id, [snapshot(created, 1, 'CREATE', user.username)])
        logAction(user.username, 'town.create', created.id, created.name)
        return json(res, 201, created)
      }
      return fail(res, 405, 'method_not_allowed', 'Метод не поддерживается')
    }

    const index = towns.findIndex((item) => item.id === id)
    if (index < 0) return fail(res, 404, 'not_found', 'Поселение не найдено')
    const current = towns[index]

    if (!action && method === 'GET') {
      const user = bearer(req)
      if (!current.visible && !user) return fail(res, 404, 'not_found', 'Поселение не найдено')
      return json(res, 200, current)
    }

    if (!action && method === 'PUT') {
      const user = requireUser(req, res)
      if (!user) return
      const body = await readBody(req)
      const result = sanitizeTown(body || {}, current)
      if (result.errors.length) return fail(res, 400, 'invalid_town', result.errors[0])
      const updated = {
        ...current,
        ...result.value,
        revision: current.revision + 1,
        updatedAt: now(),
        updatedBy: user.username,
      }
      towns[index] = updated
      history.get(updated.id)?.unshift(snapshot(updated, updated.revision, 'UPDATE', user.username))
      logAction(user.username, 'town.update', updated.id, updated.name)
      return json(res, 200, updated)
    }

    if (!action && method === 'DELETE') {
      const user = requireUser(req, res)
      if (!user) return
      if (user.role !== 'ADMIN') return fail(res, 403, 'forbidden', 'Требуются права администратора')
      towns.splice(index, 1)
      logAction(user.username, 'town.delete', id, current.name)
      res.writeHead(204).end()
      return
    }

    if (action === 'visibility' && method === 'PATCH') {
      const user = requireUser(req, res)
      if (!user) return
      const body = await readBody(req)
      const updated = {
        ...current,
        visible: !!body?.visible,
        revision: current.revision + 1,
        updatedAt: now(),
        updatedBy: user.username,
      }
      towns[index] = updated
      history.get(updated.id)?.unshift(snapshot(updated, updated.revision, 'VISIBILITY', user.username))
      logAction(user.username, 'town.visibility', updated.id, String(updated.visible))
      return json(res, 200, updated)
    }

    if (action === 'history' && method === 'GET') {
      const user = bearer(req)
      if (!user) return fail(res, 401, 'unauthorized', 'Требуется вход')
      const list = history.get(id) || []
      return json(res, 200, { history: list, count: list.length })
    }

    if (action === 'restore' && method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return
      if (user.role !== 'ADMIN') return fail(res, 403, 'forbidden', 'Требуются права администратора')
      const body = await readBody(req)
      const entry = (history.get(id) || []).find((item) => item.revision === Number(body?.revision))
      if (!entry) return fail(res, 404, 'not_found', 'Ревизия не найдена')
      const updated = {
        ...JSON.parse(JSON.stringify(entry.snapshot)),
        id,
        revision: current.revision + 1,
        updatedAt: now(),
        updatedBy: user.username,
        createdAt: current.createdAt,
        createdBy: current.createdBy,
      }
      towns[index] = updated
      history.get(id)?.unshift(snapshot(updated, updated.revision, 'RESTORE', user.username))
      logAction(user.username, 'town.restore', id, String(body?.revision))
      return json(res, 200, updated)
    }

    return fail(res, 404, 'not_found', 'Маршрут не найден')
  }

  return fail(res, 404, 'not_found', 'Маршрут не найден')
}

/* ------------------------------------------------------------------ dynmap */

function handleDynmap(req, res, url) {
  if (url.pathname === '/up/configuration') return json(res, 200, configuration)

  const worldMatch = url.pathname.match(/^\/up\/world\/([^/]+)\/(\d+)$/)
  if (worldMatch) {
    const players = playersNow()
    const minutes = (Date.now() / 1000 / 60) % 20
    return json(res, 200, {
      timestamp: Number(worldMatch[2]),
      servertime: Math.round((minutes / 20) * 24000),
      hasStorm: false,
      isThundering: false,
      confighash: configuration.confighash,
      players,
      updates: [],
      currentcount: players.length,
      maxcount: 40,
      messages: [],
    })
  }

  if (url.pathname === '/up/world/map/world' || url.pathname === '/up/worlds') {
    return json(res, 200, {
      worlds: configuration.worlds.map((world) => ({ name: world.name, title: world.title })),
    })
  }

  if (url.pathname.startsWith('/tiles/faces/')) {
    const match = url.pathname.match(/\/tiles\/faces\/(?:\d+x\d+|body)\/([^/]+)\.png$/)
    if (match) {
      const png = avatarPng(decodeURIComponent(match[1]))
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' })
      res.end(png)
      return
    }
  }

  return false
}

/* ------------------------------------------------------------------ статика */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

async function serveFile(res, file, cacheControl) {
  try {
    const info = await stat(file)
    if (!info.isFile()) return false
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': cacheControl,
    })
    createReadStream(file).pipe(res)
    return true
  } catch {
    return false
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }

    if (url.pathname.startsWith('/up/')) {
      if (handleDynmap(req, res, url) !== false) return
      return fail(res, 404, 'not_found', 'Dynmap: маршрут не найден')
    }

    if (url.pathname.startsWith('/tiles/')) {
      if (handleDynmap(req, res, url) !== false) return
      const file = path.join(TILES, decodeURIComponent(url.pathname.replace('/tiles/', '')))
      if (!file.startsWith(TILES)) return fail(res, 400, 'bad_path', 'Некорректный путь')
      if (await serveFile(res, file, 'public, max-age=86400')) return
      // прозрачный пиксель, чтобы Leaflet не рисовал «битые» тайлы
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAX+d1cQAAAABJRU5ErkJggg==',
        'base64',
      )
      res.writeHead(404, { 'Content-Type': 'image/png' })
      res.end(pixel)
      return
    }

    // SPA
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const candidate = path.join(DIST, pathname)
    if (candidate.startsWith(DIST) && (await serveFile(res, candidate, 'public, max-age=300'))) return
    if (await serveFile(res, path.join(DIST, 'index.html'), 'no-cache')) return

    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Сначала соберите фронтенд: cd web && npm run build')
  } catch (error) {
    console.error('[mock]', error)
    if (!res.headersSent) fail(res, 500, 'internal_error', 'Ошибка мок-сервера')
    else res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Hypemap mock: http://${HOST}:${PORT}`)
  console.log(`Статика: ${DIST}`)
  console.log(`Тайлы:   ${TILES}`)
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.warn('Внимание: web/dist не найден — выполните `npm run build`.')
  }
})
