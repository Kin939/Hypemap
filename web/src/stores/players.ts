import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchWorldUpdate } from '@/api/dynmap'
import { fetchBlueMapPlayers } from '@/api/bluemap'
import type { DynmapPlayer } from '@/api/types'
import { useServerStore } from './server'

/**
 * Игроки онлайн: опрос /up/world/<world>/<timestamp> (родной механизм Dynmap).
 * Интервал берётся из /up/configuration (updaterate — в миллисекундах, как в map.js Dynmap).
 */
export const usePlayersStore = defineStore('players', () => {
  const server = useServerStore()

  const players = ref<DynmapPlayer[]>([])
  const count = ref(0)
  const max = ref(0)
  const lastUpdate = ref(0)
  const connected = ref(false)
  const servertime = ref(6000)
  const storm = ref(false)

  let timer: number | null = null
  let controller: AbortController | null = null
  let running = false

  const world = computed(() => server.currentMap?.world ?? server.dynmap?.defaultworld ?? 'world')
  const isDay = computed(() => servertime.value >= 0 && servertime.value < 12300)
  const intervalMs = computed(() => {
    const rate = Number(server.dynmap?.updaterate)
    const ms = Number.isFinite(rate) && rate > 0 ? rate : 2000
    return Math.min(Math.max(ms, 1500), 60_000)
  })

  /** BlueMap отдаёт свой список игроков — приводим его к общему виду. */
  async function pollBlueMap(signal: AbortSignal): Promise<void> {
    const mapId = server.currentMap?.world ?? ''
    const list = await fetchBlueMapPlayers(mapId, signal)
    players.value = (list || [])
      .filter((entry) => typeof entry.name === 'string' && entry.position)
      .map((entry) => ({
        name: entry.name,
        account: entry.uuid ?? entry.name,
        world: mapId,
        x: entry.position?.x ?? 0,
        y: entry.position?.y ?? 64,
        z: entry.position?.z ?? 0,
      }))
    count.value = players.value.length
    lastUpdate.value = Date.now()
    connected.value = true
  }

  async function poll(): Promise<void> {
    if (!running) return
    controller?.abort()
    controller = new AbortController()
    try {
      if (server.renderer === 'bluemap') {
        await pollBlueMap(controller.signal)
        return
      }
      const response = await fetchWorldUpdate(world.value, Date.now(), controller.signal)
      players.value = (response.players || []).filter(
        (player) => player.world === world.value && player.name !== undefined,
      )
      count.value = response.currentcount ?? players.value.length
      max.value = response.maxcount ?? max.value
      if (typeof response.servertime === 'number') servertime.value = response.servertime
      if (typeof response.hasStorm === 'boolean') storm.value = response.hasStorm
      lastUpdate.value = Date.now()
      connected.value = true
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        connected.value = false
      }
    } finally {
      if (running) timer = window.setTimeout(poll, intervalMs.value)
    }
  }

  function start(): void {
    if (running) return
    running = true
    void poll()
  }

  function stop(): void {
    running = false
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    controller?.abort()
    controller = null
  }

  function restart(): void {
    stop()
    players.value = []
    start()
  }

  return {
    players,
    count,
    max,
    lastUpdate,
    connected,
    servertime,
    storm,
    isDay,
    intervalMs,
    start,
    stop,
    restart,
  }
})
