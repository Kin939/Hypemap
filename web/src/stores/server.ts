import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/endpoints'
import { fetchConfiguration } from '@/api/dynmap'
import type { DynmapConfiguration, MapDefinition, MetaResponse } from '@/api/types'
import { buildMapDefinition } from '@/map/dynmapMath'

export const useServerStore = defineStore('server', () => {
  const meta = ref<MetaResponse | null>(null)
  const dynmap = ref<DynmapConfiguration | null>(null)
  const maps = ref<MapDefinition[]>([])
  const currentIndex = ref(0)
  const loading = ref(true)
  const error = ref('')
  const dynmapAvailable = ref(false)

  const currentMap = computed<MapDefinition | null>(() => maps.value[currentIndex.value] ?? null)
  const worlds = computed(() => {
    const result: Array<{ name: string; title: string; maps: Array<{ index: number; def: MapDefinition }> }> = []
    maps.value.forEach((def, index) => {
      let world = result.find((item) => item.name === def.world)
      if (!world) {
        world = { name: def.world, title: def.worldTitle, maps: [] }
        result.push(world)
      }
      world.maps.push({ index, def })
    })
    return result
  })
  const title = computed(() => meta.value?.title || 'Hypemap')
  const serverName = computed(() => meta.value?.serverName || meta.value?.server.name || 'Minecraft Server')
  const onlineCount = computed(() => meta.value?.server.online ?? 0)
  const maxPlayers = computed(() => meta.value?.server.max ?? 0)
  const flags = computed(() => meta.value?.flags ?? [])

  async function loadMeta(): Promise<void> {
    try {
      meta.value = await api.meta()
    } catch {
      // публичная карта должна работать даже без API
    }
  }

  async function loadDynmap(): Promise<void> {
    try {
      const configuration = await fetchConfiguration()
      dynmap.value = configuration
      const list: MapDefinition[] = []
      for (const world of configuration.worlds ?? []) {
        for (const map of world.maps ?? []) {
          list.push(buildMapDefinition(world, map))
        }
      }
      maps.value = list
      dynmapAvailable.value = list.length > 0

      const wantedWorld = configuration.defaultworld
      const wantedMap = configuration.defaultmap
      const index = list.findIndex((def) => def.world === wantedWorld && def.name === wantedMap)
      currentIndex.value = index >= 0 ? index : 0
    } catch (err) {
      error.value = 'Не удалось загрузить конфигурацию Dynmap'
      dynmapAvailable.value = false
      console.warn('[hypemap] dynmap configuration error', err)
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    await Promise.allSettled([loadMeta(), loadDynmap()])
    loading.value = false
  }

  function selectMap(index: number): void {
    if (index >= 0 && index < maps.value.length) currentIndex.value = index
  }

  function selectMapByName(world: string, name: string): void {
    const index = maps.value.findIndex((def) => def.world === world && def.name === name)
    if (index >= 0) currentIndex.value = index
  }

  function refreshMeta(): Promise<void> {
    return loadMeta()
  }

  return {
    meta,
    dynmap,
    maps,
    currentIndex,
    currentMap,
    worlds,
    loading,
    error,
    dynmapAvailable,
    title,
    serverName,
    onlineCount,
    maxPlayers,
    flags,
    load,
    loadMeta,
    loadDynmap,
    selectMap,
    selectMapByName,
    refreshMeta,
  }
})
