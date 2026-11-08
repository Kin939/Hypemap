/** Типы данных, общие для API плагина и Dynmap. */

export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface AuthUser {
  username: string
  role: Role
  source: 'local' | 'access' | string
  email?: string | null
}

export interface TownPoint {
  x: number
  z: number
}

export interface TownMember {
  name: string
  role: 'OWNER' | 'MEMBER'
}

export interface Town {
  id: string
  name: string
  description: string
  world: string
  y: number
  polygon: TownPoint[]
  fillColor: string
  lineColor: string
  fillOpacity: number
  lineOpacity: number
  lineWeight: number
  members: TownMember[]
  flags: string[]
  visible: boolean
  minZoom: number
  maxZoom: number
  icon: string
  createdAt: number
  updatedAt: number
  createdBy: string
  updatedBy: string
  revision: number
}

export interface TownInput {
  name?: string
  description?: string
  world?: string
  y?: number
  polygon?: TownPoint[]
  fillColor?: string
  lineColor?: string
  fillOpacity?: number
  lineOpacity?: number
  lineWeight?: number
  members?: TownMember[]
  flags?: string[]
  visible?: boolean
  minZoom?: number
  maxZoom?: number
  icon?: string
}

export interface TownListResponse {
  towns: Town[]
  count: number
  updatedAt: string
  serverTime: string
}

export interface HistoryEntry {
  townId: string
  revision: number
  action: string
  actor: string
  createdAt: string
  snapshot: Town
}

export interface LoginResponse {
  token: string
  expiresAt: number
  user: AuthUser
}

export interface MeResponse {
  authenticated: boolean
  user?: AuthUser
  auth: { mode: string; localLogin: boolean }
}

export interface MetaResponse {
  title: string
  serverName: string
  version: string
  apiVersion: number
  server: {
    name: string
    minecraft: string
    online: number
    max: number
    worlds: string[]
    players: string[]
  }
  dynmap: { available: boolean; version: string; markerSetId: string; url: string }
  auth: { mode: string; localLogin: boolean; access: boolean }
  limits: {
    maxPolygonPoints: number
    maxMembers: number
    minNameLength: number
    maxNameLength: number
    maxBodyBytes: number
  }
  flags: string[]
  townCount: number
  defaults: {
    fillColor: string
    lineColor: string
    fillOpacity: number
    lineOpacity: number
    lineWeight: number
  }
  discordInvite: string
}

export interface KnownPlayersResponse {
  players: string[]
  online: string[]
}

export interface AuditEntry {
  id: number
  at: string
  actor: string
  action: string
  townId: string | null
  details: string | null
}

/* ------------------------------------------------------------------ Dynmap */

export interface DynmapMapConfig {
  type: string
  name: string
  title?: string
  icon?: string
  prefix: string
  background?: string
  backgroundday?: string
  backgroundnight?: string
  bigmap?: boolean
  mapzoomout: number
  mapzoomin: number
  boostzoom?: number
  tilescale?: number
  protected?: boolean
  'image-format'?: string
  nightandday?: boolean
  append_to_world?: string
  worldtomap?: [number, number, number, number, number, number, number, number, number]
  maptoworld?: [number, number, number, number, number, number, number, number, number]
  perspective?: string
}

export interface DynmapWorldConfig {
  name: string
  title?: string
  protected?: boolean
  center: { x: number; y: number; z: number }
  extrazoomout?: number
  sealevel?: number
  worldheight?: number
  maps: DynmapMapConfig[]
}

export interface DynmapConfiguration {
  confighash?: number
  updaterate?: number
  title?: string
  defaultworld?: string
  defaultmap?: string
  maxcount?: number
  worlds: DynmapWorldConfig[]
  dynmapversion?: string
  coreversion?: string
  showplayerfacesinmenu?: string
  'login-enabled'?: boolean
  components?: Array<{ type?: string }>
}

export interface DynmapPlayer {
  type?: string
  name: string
  account: string
  world: string
  x: number
  y: number
  z: number
  health?: number
  armor?: number
  sort?: number
}

export interface DynmapWorldUpdate {
  timestamp: number
  servertime?: number
  hasStorm?: boolean
  isThundering?: boolean
  confighash?: number
  players: DynmapPlayer[]
  updates?: Array<{ type?: string; name?: string; [key: string]: unknown }>
  currentcount?: number
  maxcount?: number
  messages?: Array<{ type?: string; text?: string; message?: string }>
}

/** Описание карты, собранное из /up/configuration и готовое для MapEngine. */
export interface MapDefinition {
  world: string
  worldTitle: string
  name: string
  title: string
  type: string
  prefix: string
  imageFormat: string
  tileSize: number
  nativeZoomLevels: number
  extraZoomLevels: number
  maxZoom: number
  minZoom: number
  nightAndDay: boolean
  background: string
  center: { x: number; y: number; z: number }
  projection: {
    worldToMap: number[]
    mapToWorld: number[]
    nativeZoomLevels: number
    tileSize: number
    prefix: string
    imageFormat: string
    nightAndDay: boolean
    maxZoom: number
    mapZoomIn: number
  }
}
