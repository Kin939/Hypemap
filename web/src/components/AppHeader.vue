<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Castle, Map as MapIcon, Moon, ShieldCheck, Sun, Users } from 'lucide-vue-next'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { usePlayersStore } from '@/stores/players'

const route = useRoute()
const server = useServerStore()
const ui = useUiStore()
const auth = useAuthStore()
const players = usePlayersStore()

const online = computed(() => (players.connected ? players.count : server.onlineCount))
const maxPlayers = computed(() => players.max || server.maxPlayers)
const isMapRoute = computed(() => route.name === 'map')
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand" aria-label="Hypemap — на главную">
      <span class="brand__mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 2.6 20.5 7v10L12 21.4 3.5 17V7z" stroke-linejoin="round" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span class="brand__text">
        <span class="brand__title">{{ server.title }}</span>
        <span class="brand__subtitle">{{ server.serverName }}</span>
      </span>
    </RouterLink>

    <nav class="nav" aria-label="Основная навигация">
      <RouterLink to="/" class="nav__link" :class="{ 'is-active': isMapRoute }">
        <MapIcon :size="15" /> Карта
      </RouterLink>
      <RouterLink to="/towns" class="nav__link" :class="{ 'is-active': route.name === 'towns' }">
        <Castle :size="15" /> Поселения
      </RouterLink>
      <RouterLink to="/admin" class="nav__link" :class="{ 'is-active': String(route.name).startsWith('admin') }">
        <ShieldCheck :size="15" /> Админка
      </RouterLink>
    </nav>

    <div class="topbar__spacer" />

    <span class="pill pill--live" :title="`Игроков онлайн: ${online} из ${maxPlayers}`">
      <span class="pill__dot" />
      <Users :size="14" />
      <span class="pill__value mono">{{ online }}</span>
      <span class="faint pill__label">/ {{ maxPlayers || '—' }}</span>
    </span>

    <button
      class="icon-btn"
      type="button"
      :title="ui.isDark ? 'Светлая тема' : 'Тёмная тема'"
      :aria-label="ui.isDark ? 'Включить светлую тему' : 'Включить тёмную тему'"
      @click="ui.toggleTheme()"
    >
      <Sun v-if="ui.isDark" :size="17" />
      <Moon v-else :size="17" />
    </button>

    <RouterLink
      v-if="auth.isAuthenticated"
      to="/admin"
      class="pill"
      :title="`Вы вошли как ${auth.user?.username} (${auth.user?.role})`"
    >
      <ShieldCheck :size="14" class="faint" />
      <span class="pill__value">{{ auth.user?.username }}</span>
    </RouterLink>
  </header>
</template>
