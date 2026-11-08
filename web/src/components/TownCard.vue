<script setup lang="ts">
import { computed } from 'vue'
import { EyeOff, Ruler, Users } from 'lucide-vue-next'
import type { Town } from '@/api/types'
import { polygonArea } from '@/stores/towns'
import { flagLabel, formatArea, hexToRgba } from '@/utils/format'

const props = defineProps<{
  town: Town
  active?: boolean
}>()

const emit = defineEmits<{ (event: 'select', id: string): void }>()

const swatchStyle = computed(() => ({
  background: `linear-gradient(140deg, ${hexToRgba(props.town.fillColor, 0.95)}, ${hexToRgba(
    props.town.lineColor,
    0.75,
  )})`,
}))
const area = computed(() => polygonArea(props.town.polygon))
const owners = computed(() => props.town.members.filter((member) => member.role === 'OWNER'))
</script>

<template>
  <button
    type="button"
    class="town-card"
    :class="{ 'is-active': active }"
    @click="emit('select', town.id)"
  >
    <span class="town-card__swatch" :style="swatchStyle" />
    <span class="town-card__main">
      <span class="town-card__top">
        <span class="town-card__name">{{ town.name }}</span>
        <span v-if="!town.visible" class="badge badge--hidden" title="Скрыто с публичной карты">
          <EyeOff :size="10" /> скрыто
        </span>
      </span>
      <span class="town-card__meta">
        <span>
          <Users :size="12" />
          {{ town.members.length || 'нет' }}
          <template v-if="owners.length">· {{ owners[0].name }}</template>
        </span>
        <span>
          <Ruler :size="12" />
          {{ formatArea(area) }}
        </span>
      </span>
      <span v-if="town.flags.length" class="town-card__flags">
        <span v-for="flag in town.flags.slice(0, 3)" :key="flag" class="badge">{{ flagLabel(flag) }}</span>
      </span>
    </span>
  </button>
</template>
