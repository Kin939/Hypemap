<script setup lang="ts">
import { computed } from 'vue'
import { Layers, Maximize2, Minus, Moon, Plus, Sun } from 'lucide-vue-next'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'

const server = useServerStore()
const ui = useUiStore()

const emit = defineEmits<{
  (event: 'zoom-in'): void
  (event: 'zoom-out'): void
  (event: 'reset-view'): void
}>()

const options = computed(() =>
  server.maps.map((def, index) => ({
    index,
    label: `${def.worldTitle} · ${def.title}`,
  })),
)

function onChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  server.selectMap(value)
}
</script>

<template>
  <div class="map-toolbar">
    <div class="map-toolbar__group">
      <Layers :size="15" class="faint" style="margin-left: 4px" />
      <select class="map-select" :value="server.currentIndex" aria-label="Слои карты" @change="onChange">
        <option v-for="option in options" :key="option.index" :value="option.index">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="map-toolbar__group map-toolbar__group--column">
      <button class="icon-btn icon-btn--sm" type="button" title="Приблизить" @click="emit('zoom-in')">
        <Plus :size="16" />
      </button>
      <button class="icon-btn icon-btn--sm" type="button" title="Отдалить" @click="emit('zoom-out')">
        <Minus :size="16" />
      </button>
      <button class="icon-btn icon-btn--sm" type="button" title="Сбросить вид" @click="emit('reset-view')">
        <Maximize2 :size="15" />
      </button>
      <button
        class="icon-btn icon-btn--sm"
        type="button"
        :class="{ 'is-active': ui.nightPreview }"
        :title="ui.nightPreview ? 'Дневной вид' : 'Ночной вид'"
        @click="ui.nightPreview = !ui.nightPreview"
      >
        <Moon v-if="!ui.nightPreview" :size="15" />
        <Sun v-else :size="15" />
      </button>
    </div>
  </div>
</template>
