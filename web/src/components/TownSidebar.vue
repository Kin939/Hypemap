<script setup lang="ts">
import { computed } from 'vue'
import { ListFilter, Search, Sparkles, X } from 'lucide-vue-next'
import { useTownsStore } from '@/stores/towns'
import { useServerStore } from '@/stores/server'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { flagLabel, formatArea, relativeTime } from '@/utils/format'
import TownCard from './TownCard.vue'
import type { SortMode } from '@/stores/towns'

const towns = useTownsStore()
const server = useServerStore()
const auth = useAuthStore()
const ui = useUiStore()

const sorted = computed(() => towns.filtered)
const isEmpty = computed(() => !towns.loading && sorted.value.length === 0)

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'name', label: 'По названию' },
  { value: 'area', label: 'По площади' },
  { value: 'players', label: 'По игрокам' },
  { value: 'updated', label: 'По обновлению' },
]

function select(id: string): void {
  towns.select(towns.selectedId === id ? null : id, true)
  if (window.innerWidth <= 860) ui.toggleSidebar(false)
}

function clearSearch(): void {
  towns.query = ''
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-open': ui.sidebarOpen }">
    <div class="sheet-grabber" @click="ui.toggleSidebar(false)" />
    <div class="sidebar__head">
      <div class="sidebar__title-row">
        <h2 class="sidebar__title">Поселения</h2>
        <span class="sidebar__count mono">{{ sorted.length }} / {{ towns.towns.length }}</span>
      </div>

      <label class="search">
        <Search :size="15" />
        <input
          v-model="towns.query"
          type="search"
          placeholder="Название, игрок, описание…"
          autocomplete="off"
          aria-label="Поиск поселений"
        />
        <button v-if="towns.query" class="search__clear" type="button" aria-label="Очистить" @click="clearSearch">
          <X :size="13" />
        </button>
      </label>

      <div class="row row--between">
        <div class="chips">
          <button
            v-for="flag in towns.flagsInUse.slice(0, 4)"
            :key="flag"
            type="button"
            class="chip"
            :class="{ 'is-active': towns.activeFlags.includes(flag) }"
            @click="towns.toggleFlag(flag)"
          >
            {{ flagLabel(flag) }}
          </button>
        </div>
        <span class="faint" :title="'Набор флагов сервера'">
          <ListFilter :size="14" />
        </span>
      </div>

      <div class="row" style="gap: 8px">
        <select v-model="towns.sortMode" class="select input--sm" aria-label="Сортировка">
          <option v-for="option in sortOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button
          v-if="auth.isAuthenticated"
          type="button"
          class="chip"
          :class="{ 'is-active': towns.onlyMine }"
          @click="towns.onlyMine = !towns.onlyMine"
        >
          Мои
        </button>
      </div>
    </div>

    <div class="sidebar__body">
      <template v-if="towns.loading && !towns.towns.length">
        <div v-for="index in 6" :key="index" class="skeleton" style="height: 74px" />
      </template>

      <div v-else-if="isEmpty" class="empty">
        <span class="empty__icon"><Sparkles :size="20" /></span>
        <span class="empty__title">
          {{ towns.towns.length ? 'Ничего не найдено' : 'Пока нет поселений' }}
        </span>
        <span v-if="towns.towns.length">Попробуйте изменить запрос или сбросить фильтры.</span>
        <button v-if="towns.towns.length" class="btn btn--sm" type="button" @click="towns.resetFilters()">
          Сбросить фильтры
        </button>
        <RouterLink v-else-if="auth.isEditor" to="/admin" class="btn btn--sm btn--primary">
          Создать первое
        </RouterLink>
      </div>

      <TownCard
        v-for="town in sorted"
        :key="town.id"
        :town="town"
        :active="towns.selectedId === town.id"
        @select="select"
      />
    </div>

    <div class="sidebar__foot">
      <span>{{ towns.totalMembers }} игроков · {{ formatArea(towns.totalArea) }}</span>
      <span v-if="towns.lastLoadedAt" class="mono">{{ relativeTime(towns.lastLoadedAt) }}</span>
      <span v-else-if="server.dynmapAvailable" class="mono">
        {{ server.renderer === 'bluemap' ? 'bluemap ok' : 'dynmap ok' }}
      </span>
    </div>
  </aside>
</template>
