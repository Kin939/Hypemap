import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import type { HistoryEntry, Town, TownInput } from '@/api/types'
import { useAuthStore } from './auth'

export type SortMode = 'name' | 'area' | 'updated' | 'players'

export const useTownsStore = defineStore('towns', () => {
  const auth = useAuthStore()

  const towns = ref<Town[]>([])
  const loading = ref(false)
  const error = ref('')
  const query = ref('')
  const activeFlags = ref<string[]>([])
  const sortMode = ref<SortMode>('name')
  const onlyMine = ref(false)
  const selectedId = ref<string | null>(null)
  const lastLoadedAt = ref(0)

  const selected = computed<Town | null>(
    () => towns.value.find((town) => town.id === selectedId.value) ?? null,
  )

  const flagsInUse = computed(() => {
    const set = new Set<string>()
    for (const town of towns.value) {
      for (const flag of town.flags) set.add(flag)
    }
    return Array.from(set).sort()
  })

  const filtered = computed<Town[]>(() => {
    const needle = query.value.trim().toLowerCase()
    const flags = activeFlags.value
    const player = auth.user?.username?.toLowerCase() ?? ''

    let list = towns.value.filter((town) => {
      if (needle) {
        const inName = town.name.toLowerCase().includes(needle)
        const inMembers = town.members.some((member) => member.name.toLowerCase().includes(needle))
        const inDescription = town.description.toLowerCase().includes(needle)
        if (!inName && !inMembers && !inDescription) return false
      }
      if (flags.length && !flags.every((flag) => town.flags.includes(flag))) return false
      if (onlyMine.value && player) {
        if (!town.members.some((member) => member.name.toLowerCase() === player)) return false
      }
      return true
    })

    list = [...list].sort((a, b) => {
      switch (sortMode.value) {
        case 'area':
          return polygonArea(b.polygon) - polygonArea(a.polygon)
        case 'updated':
          return b.updatedAt - a.updatedAt
        case 'players':
          return b.members.length - a.members.length
        default:
          return a.name.localeCompare(b.name, 'ru')
      }
    })
    return list
  })

  const totalMembers = computed(() => {
    const set = new Set<string>()
    for (const town of towns.value) {
      for (const member of town.members) set.add(member.name.toLowerCase())
    }
    return set.size
  })

  const totalArea = computed(() => towns.value.reduce((sum, town) => sum + polygonArea(town.polygon), 0))

  function replaceTown(town: Town): void {
    const index = towns.value.findIndex((item) => item.id === town.id)
    if (index >= 0) towns.value[index] = town
    else towns.value.push(town)
  }

  async function load(includeHidden = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const response = await api.towns({ includeHidden })
      towns.value = response.towns
      lastLoadedAt.value = Date.now()
      if (selectedId.value && !towns.value.some((town) => town.id === selectedId.value)) {
        selectedId.value = null
      }
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'Не удалось загрузить поселения'
    } finally {
      loading.value = false
    }
  }

  /** Фоновое обновление без мигания скелетонов. */
  async function refresh(includeHidden = false): Promise<void> {
    try {
      const response = await api.towns({ includeHidden })
      towns.value = response.towns
      lastLoadedAt.value = Date.now()
      if (selectedId.value && !towns.value.some((town) => town.id === selectedId.value)) {
        selectedId.value = null
      }
    } catch {
      // тихо игнорируем: следующая попытка через N секунд
    }
  }

  async function create(input: TownInput): Promise<Town> {
    const town = await api.createTown(input)
    replaceTown(town)
    return town
  }

  async function update(id: string, input: TownInput): Promise<Town> {
    const town = await api.updateTown(id, input)
    replaceTown(town)
    return town
  }

  async function remove(id: string): Promise<void> {
    await api.deleteTown(id)
    towns.value = towns.value.filter((town) => town.id !== id)
    if (selectedId.value === id) selectedId.value = null
  }

  async function setVisibility(id: string, visible: boolean): Promise<Town> {
    const town = await api.setVisibility(id, visible)
    replaceTown(town)
    return town
  }

  async function history(id: string): Promise<HistoryEntry[]> {
    const response = await api.history(id)
    return response.history
  }

  async function restore(id: string, revision: number): Promise<Town> {
    const town = await api.restore(id, revision)
    replaceTown(town)
    return town
  }

  const focusRequest = ref(0)

  /** select(id, true) — выбрать поселение и попросить карту к нему перелететь. */
  function select(id: string | null, focus = false): void {
    selectedId.value = id
    if (focus && id) focusRequest.value += 1
  }

  function toggleFlag(flag: string): void {
    activeFlags.value = activeFlags.value.includes(flag)
      ? activeFlags.value.filter((item) => item !== flag)
      : [...activeFlags.value, flag]
  }

  function resetFilters(): void {
    query.value = ''
    activeFlags.value = []
    onlyMine.value = false
  }

  return {
    towns,
    loading,
    error,
    query,
    activeFlags,
    flagsInUse,
    sortMode,
    onlyMine,
    selectedId,
    selected,
    filtered,
    totalMembers,
    totalArea,
    lastLoadedAt,
    load,
    refresh,
    create,
    update,
    remove,
    setVisibility,
    history,
    restore,
    focusRequest,
    select,
    toggleFlag,
    resetFilters,
  }
})

export function polygonArea(polygon: Array<{ x: number; z: number }>): number {
  if (polygon.length < 3) return 0
  let sum = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.z - b.x * a.z
  }
  return Math.abs(sum / 2)
}
