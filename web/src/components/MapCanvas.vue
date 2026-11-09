<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { DynmapPlayer, MapDefinition, Town, TownPoint } from '@/api/types'
import { playerFaceUrl } from '@/api/dynmap'
import { MapEngine, type MapView } from '@/map/MapEngine'

const props = withDefaults(
  defineProps<{
    map: MapDefinition | null
    towns?: Town[]
    players?: DynmapPlayer[]
    selectedId?: string | null
    isDay?: boolean
    nightPreview?: boolean
    editing?: boolean
    draft?: TownPoint[] | null
    editY?: number
  }>(),
  {
    towns: () => [],
    players: () => [],
    selectedId: null,
    isDay: true,
    nightPreview: false,
    editing: false,
    draft: null,
    editY: 64,
  },
)

const emit = defineEmits<{
  (event: 'town-click', id: string): void
  (event: 'view-change', view: MapView): void
  (event: 'draft-change', points: TownPoint[]): void
  (event: 'player-click', player: DynmapPlayer): void
}>()

const container = ref<HTMLDivElement | null>(null)
const engine = shallowRef<MapEngine | null>(null)
let editingApplied = false

function syncAll(): void {
  const instance = engine.value
  if (!instance) return
  if (props.map) instance.setMap(props.map)
  instance.setTowns(props.towns || [])
  instance.setPlayers(props.players || [])
  instance.setSelected(props.selectedId ?? null)
  instance.setDay(props.isDay)
  instance.setNightPreview(props.nightPreview)
  if (props.editing) {
    instance.startEditing(props.draft ?? [], props.editY)
    editingApplied = true
  } else if (editingApplied) {
    instance.stopEditing()
    editingApplied = false
  }
}

onMounted(() => {
  if (!container.value) return
  engine.value = new MapEngine(container.value, playerFaceUrl, {
    onTownClick: (id) => emit('town-click', id),
    onViewChange: (view) => emit('view-change', view),
    onDraftChange: (points) => emit('draft-change', points),
    onPlayerClick: (player) => emit('player-click', player),
  })
  syncAll()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  engine.value?.destroy()
  engine.value = null
})

function handleResize(): void {
  engine.value?.invalidate()
}

watch(() => props.map, () => engine.value?.setMap(props.map as MapDefinition), { immediate: false })
watch(
  () => props.towns,
  (list) => engine.value?.setTowns(list || []),
  { deep: true },
)
watch(
  () => props.players,
  (list) => engine.value?.setPlayers(list || []),
  { deep: true },
)
watch(
  () => props.selectedId,
  (id) => engine.value?.setSelected(id ?? null),
)
watch(
  () => props.isDay,
  (value) => engine.value?.setDay(value),
)
watch(
  () => props.nightPreview,
  (value) => engine.value?.setNightPreview(value),
)
watch(
  () => props.editing,
  (value) => {
    const instance = engine.value
    if (!instance) return
    if (value) {
      instance.startEditing(props.draft ?? [], props.editY)
      editingApplied = true
    } else {
      instance.stopEditing()
      editingApplied = false
    }
  },
)
watch(
  () => props.editY,
  (value) => {
    if (props.editing) engine.value?.setDraftY(value)
  },
)

defineExpose({
  engine,
  focusTown: (town: Town) => engine.value?.focusTown(town),
  focusLocation: (x: number, z: number, y = 64, zoom?: number) =>
    engine.value?.focusLocation(x, z, y, zoom),
  zoomIn: () => engine.value?.zoomIn(),
  zoomOut: () => engine.value?.zoomOut(),
  undoDraft: () => engine.value?.undoDraft(),
  clearDraft: () => engine.value?.clearDraft(),
  getDraft: () => engine.value?.getDraft() ?? [],
  invalidate: () => engine.value?.invalidate(),
})
</script>

<template>
  <div ref="container" class="map-canvas" />
</template>

<style>
.leaflet-container.is-editing {
  cursor: crosshair;
}
.vertex {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #34d399;
  border: 2px solid #06110c;
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.35), 0 2px 6px rgba(0, 0, 0, 0.6);
  cursor: grab;
  transition: transform 0.12s ease, background 0.12s ease;
}
.vertex:hover {
  transform: scale(1.25);
  background: #6ee7b7;
}
.vertex-icon.leaflet-marker-draggable.leaflet-drag-target .vertex {
  cursor: grabbing;
}
</style>
