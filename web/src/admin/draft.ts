import type { MetaResponse, Town, TownInput, TownMember, TownPoint } from '@/api/types'

export interface TownDraft {
  id: string | null
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
}

export function emptyDraft(meta: MetaResponse | null, world?: string): TownDraft {
  return {
    id: null,
    name: '',
    description: '',
    world: world || meta?.server.worlds[0] || 'world',
    y: 64,
    polygon: [],
    fillColor: meta?.defaults.fillColor || '#22c55e',
    lineColor: meta?.defaults.lineColor || '#16a34a',
    fillOpacity: meta?.defaults.fillOpacity ?? 0.28,
    lineOpacity: meta?.defaults.lineOpacity ?? 1,
    lineWeight: meta?.defaults.lineWeight ?? 2,
    members: [],
    flags: [],
    visible: true,
    minZoom: 0,
    maxZoom: 10,
  }
}

export function draftFromTown(town: Town): TownDraft {
  return {
    id: town.id,
    name: town.name,
    description: town.description || '',
    world: town.world,
    y: town.y,
    polygon: town.polygon.map((point) => ({ x: point.x, z: point.z })),
    fillColor: town.fillColor,
    lineColor: town.lineColor,
    fillOpacity: town.fillOpacity,
    lineOpacity: town.lineOpacity,
    lineWeight: town.lineWeight,
    members: town.members.map((member) => ({ ...member })),
    flags: [...town.flags],
    visible: town.visible,
    minZoom: town.minZoom,
    maxZoom: town.maxZoom,
  }
}

export function draftToInput(draft: TownDraft): TownInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    world: draft.world,
    y: draft.y,
    polygon: draft.polygon.map((point) => ({ x: point.x, z: point.z })),
    fillColor: draft.fillColor,
    lineColor: draft.lineColor,
    fillOpacity: draft.fillOpacity,
    lineOpacity: draft.lineOpacity,
    lineWeight: draft.lineWeight,
    members: draft.members.map((member) => ({ ...member })),
    flags: [...draft.flags],
    visible: draft.visible,
    minZoom: draft.minZoom,
    maxZoom: draft.maxZoom,
  }
}

/** Простая проверка «на месте», чтобы не гонять запросы впустую. */
export function validateDraft(draft: TownDraft, meta: MetaResponse | null): string[] {
  const errors: string[] = []
  const min = meta?.limits.minNameLength ?? 2
  const max = meta?.limits.maxNameLength ?? 40
  const name = draft.name.trim()
  if (name.length < min) errors.push(`Название короче ${min} символов`)
  if (name.length > max) errors.push(`Название длиннее ${max} символов`)
  if (draft.polygon.length < 3) errors.push('Нужно минимум 3 вершины полигона')
  if (draft.polygon.length > (meta?.limits.maxPolygonPoints ?? 256)) errors.push('Слишком много вершин')
  if (draft.members.length > (meta?.limits.maxMembers ?? 64)) errors.push('Слишком много игроков')
  if (!draft.world) errors.push('Выберите мир')
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.fillColor)) errors.push('Некорректный цвет заливки')
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.lineColor)) errors.push('Некорректный цвет обводки')
  return errors
}
