<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Castle,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-vue-next'
import type { AuditEntry, Town } from '@/api/types'
import { api } from '@/api/endpoints'
import BaseModal from '@/components/BaseModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useServerStore } from '@/stores/server'
import { polygonArea, useTownsStore } from '@/stores/towns'
import { useUiStore } from '@/stores/ui'
import { formatArea, formatDateTime, ROLE_LABELS } from '@/utils/format'

const auth = useAuthStore()
const towns = useTownsStore()
const server = useServerStore()
const ui = useUiStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const toDelete = ref<Town | null>(null)
const deleting = ref(false)
const audit = ref<AuditEntry[]>([])
const showPasswordModal = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const passwordBusy = ref(false)

const stats = computed(() => [
  { label: 'Поселений', value: String(towns.towns.length) },
  { label: 'Скрытых', value: String(towns.towns.filter((town) => !town.visible).length) },
  { label: 'Игроков', value: String(towns.totalMembers) },
  { label: 'Площадь', value: formatArea(towns.totalArea) },
])

const rows = computed(() => towns.filtered)

onMounted(async () => {
  await auth.fetchMe()
  if (auth.isAuthenticated) await loadDashboard()
})

async function loadDashboard(): Promise<void> {
  await Promise.allSettled([towns.load(true), server.loadMeta()])
  if (auth.isAdmin) await loadAudit()
}

async function loadAudit(): Promise<void> {
  try {
    const response = await api.audit(40)
    audit.value = response.entries
  } catch {
    audit.value = []
  }
}

async function submitLogin(): Promise<void> {
  submitting.value = true
  const ok = await auth.login(username.value, password.value)
  submitting.value = false
  if (ok) {
    password.value = ''
    ui.toast(`Добро пожаловать, ${auth.user?.username}`, 'success')
    await loadDashboard()
  }
}

function logout(): void {
  auth.logout()
  towns.select(null)
  ui.toast('Вы вышли из админки')
  void router.push({ name: 'map' })
}

function edit(town: Town): void {
  void router.push({ name: 'admin-town', params: { id: town.id } })
}

function create(): void {
  void router.push({ name: 'admin-town', params: { id: 'new' } })
}

async function toggleVisibility(town: Town): Promise<void> {
  try {
    await towns.setVisibility(town.id, !town.visible)
    ui.toast(town.visible ? `«${town.name}» скрыто` : `«${town.name}» опубликовано`, 'success')
  } catch (error) {
    ui.toast((error as Error).message || 'Ошибка', 'error')
  }
}

async function confirmDelete(): Promise<void> {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await towns.remove(toDelete.value.id)
    ui.toast(`«${toDelete.value.name}» удалено`, 'success')
    toDelete.value = null
    if (auth.isAdmin) await loadAudit()
  } catch (error) {
    ui.toast((error as Error).message || 'Не удалось удалить', 'error')
  } finally {
    deleting.value = false
  }
}

async function changePassword(): Promise<void> {
  passwordBusy.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    ui.toast('Пароль обновлён', 'success')
    showPasswordModal.value = false
    currentPassword.value = ''
    newPassword.value = ''
  } catch (error) {
    ui.toast((error as Error).message || 'Не удалось сменить пароль', 'error')
  } finally {
    passwordBusy.value = false
  }
}
</script>

<template>
  <main class="admin-shell">
    <!-- ------------------------------------------------------------ login -->
    <div v-if="!auth.isAuthenticated" class="login-wrap">
      <form class="login-card" @submit.prevent="submitLogin">
        <div class="login-card__logo"><ShieldCheck :size="22" /></div>
        <div>
          <h1 style="font-size: 20px; font-weight: 720; letter-spacing: -0.02em">Вход в админку</h1>
          <p class="faint" style="font-size: 13px; margin-top: 4px">
            Управление поселениями, границами и видимостью на карте.
          </p>
        </div>

        <label class="field">
          <span class="field__label">Логин</span>
          <input v-model="username" class="input" type="text" autocomplete="username" required />
        </label>

        <label class="field">
          <span class="field__label">Пароль</span>
          <input v-model="password" class="input" type="password" autocomplete="current-password" required />
        </label>

        <p v-if="auth.error" class="field__error">{{ auth.error }}</p>

        <button class="btn btn--primary btn--block" type="submit" :disabled="submitting">
          <RefreshCw v-if="submitting" :size="15" class="spin" />
          Войти
        </button>

        <p class="faint" style="font-size: 11.5px; line-height: 1.5">
          Пароль по умолчанию выдаётся в консоли сервера при первом запуске плагина.
          Сменить: <code class="mono">/hypemap passwd admin новый-пароль</code>.
        </p>
        <p v-if="!auth.localLoginEnabled" class="field__error">
          Локальный вход отключён — используется Cloudflare Access.
        </p>
      </form>
    </div>

    <!-- -------------------------------------------------------- dashboard -->
    <div v-else class="admin-grid">
      <div class="page__head">
        <div>
          <h1 class="page__title">Управление поселениями</h1>
          <p class="page__sub">
            {{ auth.user?.username }} · {{ ROLE_LABELS[auth.user?.role || 'VIEWER'] }}
            <span v-if="auth.user?.source === 'access'" class="badge badge--accent" style="margin-left: 6px">
              Cloudflare Access
            </span>
          </p>
        </div>
        <div class="row" style="flex-wrap: wrap">
          <button class="btn btn--sm" type="button" @click="loadDashboard">
            <RefreshCw :size="14" /> Обновить
          </button>
          <button class="btn btn--sm" type="button" @click="showPasswordModal = true">
            <KeyRound :size="14" /> Пароль
          </button>
          <button class="btn btn--sm btn--ghost" type="button" @click="logout">
            <LogOut :size="14" /> Выйти
          </button>
          <button class="btn btn--primary" type="button" @click="create">
            <Plus :size="15" /> Новое поселение
          </button>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))">
        <div v-for="stat in stats" :key="stat.label" class="card" style="padding: 14px; gap: 4px">
          <span class="faint" style="font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em">
            {{ stat.label }}
          </span>
          <span style="font-size: 22px; font-weight: 700; letter-spacing: -0.02em">{{ stat.value }}</span>
        </div>
      </div>

      <div class="admin-layout">
        <section class="admin-panel">
          <div class="row row--between">
            <h2 style="font-size: 15px; font-weight: 650">Список</h2>
            <span class="faint mono" style="font-size: 11.5px">{{ rows.length }}</span>
          </div>

          <label class="search">
            <Search :size="15" />
            <input v-model="towns.query" type="search" placeholder="Поиск по названию или игроку" />
          </label>

          <div v-if="towns.loading && !towns.towns.length" class="stack">
            <div v-for="index in 5" :key="index" class="skeleton" style="height: 56px" />
          </div>

          <div v-else class="stack" style="gap: 4px">
            <div
              v-for="town in rows"
              :key="town.id"
              class="list-row"
              :class="{ 'is-active': towns.selectedId === town.id }"
              @click="towns.select(town.id)"
            >
              <span
                class="list-row__swatch"
                :style="{ background: `linear-gradient(140deg, ${town.fillColor}, ${town.lineColor})` }"
              />
              <span class="grow" style="min-width: 0">
                <span class="list-row__title" style="display: block">{{ town.name }}</span>
                <span class="list-row__sub">
                  {{ town.members.length }} игроков · {{ formatArea(polygonArea(town.polygon)) }}
                  <span v-if="!town.visible"> · скрыто</span>
                </span>
              </span>
              <button class="icon-btn icon-btn--sm" type="button" title="Редактировать" @click.stop="edit(town)">
                <Pencil :size="14" />
              </button>
              <button
                class="icon-btn icon-btn--sm"
                type="button"
                :title="town.visible ? 'Скрыть' : 'Опубликовать'"
                @click.stop="toggleVisibility(town)"
              >
                <EyeOff v-if="town.visible" :size="14" />
                <Eye v-else :size="14" />
              </button>
              <button
                class="icon-btn icon-btn--sm"
                type="button"
                title="Удалить"
                :disabled="!auth.isAdmin"
                @click.stop="toDelete = town"
              >
                <Trash2 :size="14" />
              </button>
            </div>

            <div v-if="!rows.length" class="empty">
              <span class="empty__icon"><Castle :size="20" /></span>
              <span class="empty__title">Пока нет поселений</span>
              <button class="btn btn--sm btn--primary" type="button" @click="create">Создать первое</button>
            </div>
          </div>
        </section>

        <section class="admin-panel">
          <div class="row row--between">
            <h2 style="font-size: 15px; font-weight: 650">Журнал действий</h2>
            <span class="faint" style="font-size: 11.5px">
              {{ auth.isAdmin ? 'последние 40 событий' : 'доступно администраторам' }}
            </span>
          </div>

          <div v-if="auth.isAdmin" class="stack" style="gap: 6px">
            <div v-for="entry in audit" :key="entry.id" class="history-item">
              <span class="badge">{{ entry.action }}</span>
              <span class="grow">{{ entry.actor || 'system' }}</span>
              <span class="faint mono" style="font-size: 11px">{{ formatDateTime(entry.at) }}</span>
            </div>
            <p v-if="!audit.length" class="faint" style="font-size: 12.5px">Событий пока нет.</p>
          </div>
          <p v-else class="faint" style="font-size: 12.5px">
            Журнал и управление пользователями доступны роли ADMIN.
          </p>

          <div class="divider" />
          <div class="row faint" style="font-size: 12px">
            <Users :size="13" />
            <span>
              Онлайн: {{ server.onlineCount }} / {{ server.maxPlayers || '—' }} ·
              Dynmap: {{ server.dynmapAvailable ? 'подключён' : 'недоступен' }}
            </span>
          </div>
        </section>
      </div>
    </div>

    <BaseModal
      v-if="toDelete"
      title="Удалить поселение"
      :subtitle="toDelete.name"
      @close="toDelete = null"
    >
      <p style="font-size: 13.5px; color: var(--text-muted)">
        Поселение исчезнет с публичной карты и из Dynmap. История ревизий сохранится в базе,
        но восстановить запись можно только из бэкапа.
      </p>
      <template #footer>
        <button class="btn btn--sm" type="button" @click="toDelete = null">Отмена</button>
        <button class="btn btn--sm btn--danger" type="button" :disabled="deleting" @click="confirmDelete">
          <Trash2 :size="14" /> Удалить
        </button>
      </template>
    </BaseModal>

    <BaseModal v-if="showPasswordModal" title="Смена пароля" @close="showPasswordModal = false">
      <label class="field">
        <span class="field__label">Текущий пароль</span>
        <input v-model="currentPassword" class="input" type="password" autocomplete="current-password" />
      </label>
      <label class="field">
        <span class="field__label">Новый пароль</span>
        <input v-model="newPassword" class="input" type="password" autocomplete="new-password" />
        <span class="field__hint">Минимум 8 символов</span>
      </label>
      <template #footer>
        <button class="btn btn--sm" type="button" @click="showPasswordModal = false">Отмена</button>
        <button class="btn btn--sm btn--primary" type="button" :disabled="passwordBusy" @click="changePassword">
          Сохранить
        </button>
      </template>
    </BaseModal>
  </main>
</template>

<style scoped>
.spin {
  animation: spin 1s linear infinite;
}
code {
  font-family: var(--mono);
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 5px;
  border-radius: 5px;
}
</style>
