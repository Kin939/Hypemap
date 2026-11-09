<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Castle, Loader2, TriangleAlert } from 'lucide-vue-next'
import type { DynmapPlayer, Town } from '@/api/types'
import type { MapView } from '@/map/MapEngine'
import MapCanvas from '@/components/MapCanvas.vue'
import MapToolbar from '@/components/MapToolbar.vue'
import TownDetails from '@/components/TownDetails.vue'
import TownSidebar from '@/components/TownSidebar.vue'
import { useAuthStore } from '@/stores/auth'
import { usePlayersStore } from '@/stores/players'
import { useServerStore } from '@/stores/server'
import { useTownsStore } from '@/stores/towns'
import { useUiStore } from '@/stores/ui'

const server = useServerStore()
const towns = useTownsStore()
const players = usePlayersStore()
const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()

const mapRef = ref<InstanceType<typeof MapCanvas> | null>(null)
const view = ref<MapView>({ x: 0, z: 0, zoom: 1 })
const booting = ref(true)
let refreshTimer: number | null = null

const visibleTowns = computed(() => towns.towns.filter((town) => town.visible))

onMounted(async () => {
  await Promise.all([server.load(), auth.fetchMe()])
  await towns.load(auth.isEditor)
  players.start()
  booting.value = false
  applyRouteTown()
  refreshTimer = window.setInterval(() => {
    void towns.refresh(auth.isEditor)
    void server.refreshMeta()
  }, 20_000)
})

onBeforeUnmount(() => {
  players.stop()
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
})

watch(
  () => auth.isEditor,
  async (isEditor) => {
    await towns.load(isEditor)
  },
)

watch(
  () => server.currentMap?.world,
  (world, previous) => {
    if (world && previous && world !== previous) players.restart()
  },
)

watch(
  () => towns.focusRequest,
  () => {
    if (towns.selected) mapRef.value?.focusTown(towns.selected)
  },
)

watch(
  () => route.query.town,
  () => applyRouteTown(),
)

function applyRouteTown(): void {
  const id = typeof route.query.town === 'string' ? route.query.town : null
  if (id && towns.towns.some((town) => town.id === id)) {
    towns.select(id, true)
  }
}

function onTownClick(id: string): void {
  towns.select(towns.selectedId === id ? null : id)
}

function onPlayerClick(player: DynmapPlayer): void {
  ui.toast(`${player.name}: ${Math.round(player.x)}, ${Math.round(player.y)}, ${Math.round(player.z)}`)
}

async function focusTown(town: Town): Promise<void> {
  towns.select(town.id)
  mapRef.value?.focusTown(town)
}

async function toggleVisibility(town: Town): Promise<void> {
  try {
    await towns.setVisibility(town.id, !town.visible)
    ui.toast(town.visible ? `«${town.name}» скрыто с карты` : `«${town.name}» снова на карте`, 'success')
  } catch (error) {
    ui.toast((error as Error).message || 'Не удалось изменить видимость', 'error')
  }
}

function resetView(): void {
  const map = server.currentMap
  if (!map) return
  mapRef.value?.focusLocation(map.center.x, map.center.z, map.center.y, Math.min(map.maxZoom, 2))
}

function openSidebar(): void {
  ui.toggleSidebar(true)
}

</script>

<template>
  <div class="layout">
    <TownSidebar />

    <div class="map-stage">
      <MapCanvas
        ref="mapRef"
        :map="server.currentMap"
        :towns="visibleTowns"
        :players="players.players"
        :selected-id="towns.selectedId"
        :is-day="players.isDay"
        :night-preview="ui.nightPreview"
        @town-click="onTownClick"
        @player-click="onPlayerClick"
        @view-change="view = $event"
      />

      <MapToolbar
        @zoom-in="mapRef?.zoomIn()"
        @zoom-out="mapRef?.zoomOut()"
        @reset-view="resetView"
      />

      <div class="map-hud">
        <span>x {{ Math.round(view.x) }}</span>
        <span class="map-hud__sep" />
        <span>z {{ Math.round(view.z) }}</span>
        <span class="map-hud__sep" />
        <span>z{{ view.zoom }}</span>
        <span class="map-hud__sep" />
        <span :class="{ 'faint': !players.connected }">
          {{ players.connected ? `${players.count} онлайн` : 'нет связи' }}
        </span>
      </div>

      <div class="map-attribution">Hypemap · Dynmap tiles</div>

      <TownDetails
        v-if="towns.selected"
        :town="towns.selected"
        @close="towns.select(null)"
        @focus="focusTown"
        @toggle-visibility="toggleVisibility"
      />

      <button class="mobile-fab" type="button" @click="openSidebar">
        <Castle :size="15" />
        Поселения · {{ towns.towns.length }}
      </button>

      <div v-if="booting" class="map-loading">
        <Loader2 :size="18" class="spin" />
        <span>Загружаем карту…</span>
      </div>

      <div v-else-if="!server.dynmapAvailable" class="map-notice">
        <TriangleAlert :size="15" />
        <span>Dynmap недоступен: тайлы не загружены. Проверьте туннель и настройки Dynmap.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-loading,
.map-notice {
  position: absolute;
  z-index: 1000;
  left: 50%;
  top: 18px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--panel-solid);
  box-shadow: var(--shadow-md);
  font-size: 12.5px;
  color: var(--text-muted);
  max-width: calc(100% - 32px);
}
.map-notice {
  color: var(--warn);
  border-color: rgba(251, 191, 36, 0.35);
}
.spin {
  animation: spin 1s linear infinite;
}
</style>
