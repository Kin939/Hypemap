<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowUpRight, MapPin, Ruler, Search, ShieldCheck, Users } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useServerStore } from '@/stores/server'
import { polygonArea, useTownsStore } from '@/stores/towns'
import { flagLabel, formatArea, formatDate, hexToRgba } from '@/utils/format'

const towns = useTownsStore()
const server = useServerStore()
const auth = useAuthStore()
const router = useRouter()

onMounted(async () => {
  await Promise.allSettled([server.loadMeta(), auth.fetchMe()])
  if (!towns.towns.length) await towns.load(auth.isEditor)
})

const cards = computed(() => towns.filtered)

function swatch(town: { fillColor: string; lineColor: string }) {
  return {
    background: `linear-gradient(140deg, ${hexToRgba(town.fillColor, 0.95)}, ${hexToRgba(
      town.lineColor,
      0.8,
    )})`,
  }
}

function openOnMap(id: string): void {
  void router.push({ name: 'map', query: { town: id } })
}
</script>

<template>
  <main class="page">
    <div class="page__inner">
      <div class="page__head">
        <div>
          <h1 class="page__title">Поселения сервера</h1>
          <p class="page__sub">
            {{ towns.towns.length }} поселений · {{ towns.totalMembers }} игроков ·
            {{ formatArea(towns.totalArea) }}
          </p>
        </div>
        <label class="search" style="max-width: 320px; width: 100%">
          <Search :size="15" />
          <input v-model="towns.query" type="search" placeholder="Поиск поселения…" />
        </label>
      </div>

      <div class="chips">
        <button
          v-for="flag in towns.flagsInUse"
          :key="flag"
          type="button"
          class="chip"
          :class="{ 'is-active': towns.activeFlags.includes(flag) }"
          @click="towns.toggleFlag(flag)"
        >
          {{ flagLabel(flag) }}
        </button>
        <button v-if="towns.activeFlags.length" class="chip" type="button" @click="towns.activeFlags = []">
          сбросить
        </button>
      </div>

      <div v-if="towns.loading && !towns.towns.length" class="grid">
        <div v-for="index in 6" :key="index" class="skeleton" style="height: 210px" />
      </div>

      <div v-else-if="!cards.length" class="empty">
        <span class="empty__icon"><MapPin :size="20" /></span>
        <span class="empty__title">Поселений пока нет</span>
        <span>Как только на сервере появится первое поселение, оно появится здесь.</span>
        <RouterLink v-if="auth.isEditor" to="/admin" class="btn btn--primary btn--sm">
          <ShieldCheck :size="14" /> Создать в админке
        </RouterLink>
      </div>

      <div v-else class="grid">
        <article v-for="town in cards" :key="town.id" class="card">
          <div class="card__head">
            <span class="card__swatch" :style="swatch(town)" />
            <div style="min-width: 0">
              <div class="card__title">{{ town.name }}</div>
              <div class="card__sub">
                {{ town.world }} · создано {{ formatDate(town.createdAt) }}
              </div>
            </div>
          </div>

          <p v-if="town.description" class="desc" style="min-height: 40px">{{ town.description }}</p>
          <p v-else class="faint" style="font-size: 12.5px; min-height: 40px">Без описания</p>

          <div v-if="town.flags.length" class="chips">
            <span v-for="flag in town.flags" :key="flag" class="chip chip--static">{{ flagLabel(flag) }}</span>
          </div>

          <div class="card__foot">
            <span class="row faint" style="font-size: 12px; gap: 12px">
              <span class="row" style="gap: 4px"><Users :size="12" /> {{ town.members.length }}</span>
              <span class="row" style="gap: 4px"><Ruler :size="12" /> {{ formatArea(polygonArea(town.polygon)) }}</span>
            </span>
            <button class="btn btn--sm" type="button" @click="openOnMap(town.id)">
              На карте <ArrowUpRight :size="13" />
            </button>
          </div>
        </article>
      </div>
    </div>
  </main>
</template>
