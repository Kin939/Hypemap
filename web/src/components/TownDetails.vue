<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, Crown, Eye, EyeOff, MapPin, Pencil, Ruler, Users, X } from 'lucide-vue-next'
import type { Town } from '@/api/types'
import { playerFaceUrl } from '@/api/dynmap'
import { polygonArea } from '@/stores/towns'
import { useAuthStore } from '@/stores/auth'
import { flagLabel, formatArea, formatDate, formatNumber, hexToRgba } from '@/utils/format'

const props = defineProps<{ town: Town }>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'focus', town: Town): void
  (event: 'toggle-visibility', town: Town): void
}>()

const auth = useAuthStore()
const router = useRouter()

const area = computed(() => polygonArea(props.town.polygon))
const center = computed(() => {
  const polygon = props.town.polygon
  if (!polygon.length) return { x: 0, z: 0 }
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, z: acc.z + point.z }), { x: 0, z: 0 })
  return { x: sum.x / polygon.length, z: sum.z / polygon.length }
})
const swatchStyle = computed(() => ({
  background: `linear-gradient(140deg, ${hexToRgba(props.town.fillColor, 0.95)}, ${hexToRgba(
    props.town.lineColor,
    0.8,
  )})`,
}))
const owners = computed(() => props.town.members.filter((member) => member.role === 'OWNER'))
const members = computed(() => props.town.members.filter((member) => member.role !== 'OWNER'))

function edit(): void {
  void router.push({ name: 'admin-town', params: { id: props.town.id } })
}
</script>

<template>
  <section class="details" aria-label="Информация о поселении">
    <header class="details__head">
      <span class="details__swatch" :style="swatchStyle" />
      <div class="grow" style="min-width: 0">
        <h2 class="details__title">{{ town.name }}</h2>
        <div class="details__sub">
          {{ town.world }} ·
          <span class="mono">{{ formatNumber(center.x) }}, {{ formatNumber(center.z) }}</span>
        </div>
      </div>
      <button class="icon-btn icon-btn--sm" type="button" aria-label="Закрыть" @click="emit('close')">
        <X :size="15" />
      </button>
    </header>

    <div class="details__body">
      <p v-if="town.description" class="desc">{{ town.description }}</p>

      <div v-if="town.flags.length" class="chips">
        <span v-for="flag in town.flags" :key="flag" class="chip chip--static">{{ flagLabel(flag) }}</span>
      </div>

      <div>
        <div class="section-label">
          <Users :size="11" style="vertical-align: -1px" /> Жители ({{ town.members.length }})
        </div>
        <div v-if="town.members.length" class="member-list">
          <span v-for="member in owners" :key="member.name" class="member is-owner" title="Владелец">
            <img :src="playerFaceUrl(member.name)" :alt="member.name" />
            <Crown :size="11" style="color: var(--warn)" />
            {{ member.name }}
          </span>
          <span v-for="member in members" :key="member.name" class="member">
            <img :src="playerFaceUrl(member.name)" :alt="member.name" />
            {{ member.name }}
          </span>
        </div>
        <p v-else class="faint" style="font-size: 12.5px">Игроки не указаны</p>
      </div>

      <div class="divider" />

      <dl class="kv">
        <dt><Ruler :size="12" style="vertical-align: -2px" /> Площадь</dt>
        <dd>{{ formatArea(area) }}</dd>
        <dt><MapPin :size="12" style="vertical-align: -2px" /> Вершин</dt>
        <dd>{{ town.polygon.length }}</dd>
        <dt><Clock :size="12" style="vertical-align: -2px" /> Создано</dt>
        <dd>{{ formatDate(town.createdAt) }}</dd>
        <dt>Обновлено</dt>
        <dd>{{ formatDate(town.updatedAt) }}</dd>
        <dt>Ревизия</dt>
        <dd class="mono">v{{ town.revision }}</dd>
        <dt>Автор</dt>
        <dd>{{ town.createdBy || '—' }}</dd>
      </dl>

      <p v-if="!town.visible" class="faint" style="font-size: 12px">
        Поселение скрыто с публичной карты и из ванильного Dynmap.
      </p>
    </div>

    <div class="details__actions">
      <button class="btn btn--sm" type="button" @click="emit('focus', town)">
        <MapPin :size="14" /> К поселению
      </button>
      <template v-if="auth.isEditor">
        <button class="btn btn--sm btn--primary" type="button" @click="edit">
          <Pencil :size="14" /> Редактировать
        </button>
        <button
          class="btn btn--sm btn--ghost"
          type="button"
          :title="town.visible ? 'Скрыть с публичной карты' : 'Показать на карте'"
          @click="emit('toggle-visibility', town)"
        >
          <EyeOff v-if="town.visible" :size="14" />
          <Eye v-else :size="14" />
        </button>
      </template>
    </div>
  </section>
</template>
