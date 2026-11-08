<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Clock,
  Eraser,
  Info,
  PencilRuler,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-vue-next'
import { api } from '@/api/endpoints'
import type { HistoryEntry, Town, TownPoint } from '@/api/types'
import { draftFromTown, draftToInput, emptyDraft, validateDraft, type TownDraft } from '@/admin/draft'
import BaseModal from '@/components/BaseModal.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import TownForm from '@/components/TownForm.vue'
import { useAuthStore } from '@/stores/auth'
import { useServerStore } from '@/stores/server'
import { useTownsStore } from '@/stores/towns'
import { useUiStore } from '@/stores/ui'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const towns = useTownsStore()
const server = useServerStore()
const auth = useAuthStore()
const ui = useUiStore()

const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : 'new'))
const isNew = computed(() => id.value === 'new')

const draft = ref<TownDraft>(emptyDraft(null))
const initialPolygon = ref<TownPoint[]>([])
const ready = ref(false)
const saving = ref(false)
const errors = ref<string[]>([])
const showDelete = ref(false)
const showHistory = ref(false)
const history = ref<HistoryEntry[]>([])
const historyLoading = ref(false)
const revision = ref(0)
const mapRef = ref<InstanceType<typeof MapCanvas> | null>(null)

const otherTowns = computed(() =>
  towns.towns.filter((town) => town.visible && town.id !== draft.value.id),
)
const pageTitle = computed(() => (isNew.value ? 'Новое поселение' : draft.value.name || 'Поселение'))
const vertexCount = computed(() => draft.value.polygon.length)

onMounted(async () => {
  await Promise.all([server.load(), auth.fetchMe()])
  if (!auth.isEditor) {
    ui.toast('Нужны права редактора', 'error')
    await router.replace({ name: 'admin' })
    return
  }
  if (!towns.towns.length) await towns.load(true)

  if (!isNew.value) {
    let town: Town | undefined = towns.towns.find((item) => item.id === id.value)
    if (!town) {
      try {
        town = await api.town(id.value)
      } catch {
        ui.toast('Поселение не найдено', 'error')
        await router.replace({ name: 'admin' })
        return
      }
    }
    draft.value = draftFromTown(town)
    revision.value = town.revision
  } else {
    draft.value = emptyDraft(server.meta, server.currentMap?.world)
  }

  const index = server.maps.findIndex((def) => def.world === draft.value.world)
  if (index >= 0) server.selectMap(index)

  initialPolygon.value = draft.value.polygon.map((point) => ({ ...point }))
  ready.value = true
})

watch(
  () => draft.value.world,
  (world) => {
    const index = server.maps.findIndex((def) => def.world === world)
    if (index >= 0) server.selectMap(index)
  },
)

function onDraftChange(points: TownPoint[]): void {
  draft.value.polygon = points
}

function redraw(): void {
  draft.value.polygon = []
  initialPolygon.value = []
  mapRef.value?.clearDraft()
}

function undo(): void {
  mapRef.value?.undoDraft()
}

async function save(): Promise<void> {
  errors.value = validateDraft(draft.value, server.meta)
  if (errors.value.length) {
    ui.toast(errors.value[0], 'error')
    return
  }
  saving.value = true
  const creating = isNew.value
  try {
    const input = draftToInput(draft.value)
    const town = creating
      ? await towns.create(input)
      : await towns.update(draft.value.id as string, input)
    draft.value.id = town.id
    revision.value = town.revision
    initialPolygon.value = town.polygon.map((point) => ({ ...point }))
    ui.toast(creating ? `Поселение «${town.name}» создано` : 'Изменения сохранены', 'success')
    if (creating) {
      await router.replace({ name: 'admin-town', params: { id: town.id } })
    }
  } catch (error) {
    ui.toast((error as Error).message || 'Не удалось сохранить', 'error')
  } finally {
    saving.value = false
  }
}

async function openHistory(): Promise<void> {
  if (isNew.value) return
  historyLoading.value = true
  showHistory.value = true
  try {
    history.value = await towns.history(id.value)
  } catch (error) {
    ui.toast((error as Error).message || 'История недоступна', 'error')
  } finally {
    historyLoading.value = false
  }
}

async function restore(targetRevision: number): Promise<void> {
  try {
    const town = await towns.restore(id.value, targetRevision)
    draft.value = draftFromTown(town)
    revision.value = town.revision
    initialPolygon.value = town.polygon.map((point) => ({ ...point }))
    showHistory.value = false
    ui.toast(`Восстановлена ревизия v${targetRevision}`, 'success')
  } catch (error) {
    ui.toast((error as Error).message || 'Не удалось восстановить', 'error')
  }
}

async function remove(): Promise<void> {
  try {
    await towns.remove(id.value)
    ui.toast('Поселение удалено', 'success')
    await router.replace({ name: 'admin' })
  } catch (error) {
    ui.toast((error as Error).message || 'Не удалось удалить', 'error')
  }
}
</script>

<template>
  <main class="admin-shell">
    <div class="admin-layout" v-if="ready">
      <div class="stack" style="gap: 18px">
        <div class="row" style="gap: 10px; flex-wrap: wrap">
          <RouterLink to="/admin" class="icon-btn icon-btn--sm" title="Назад">
            <ArrowLeft :size="15" />
          </RouterLink>
          <div class="grow">
            <h1 style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em">{{ pageTitle }}</h1>
            <p class="faint" style="font-size: 12px">
              <template v-if="isNew">Новое поселение</template>
              <template v-else>Ревизия v{{ revision }} · {{ draft.polygon.length }} вершин</template>
            </p>
          </div>
          <button
            v-if="!isNew"
            class="btn btn--sm"
            type="button"
            title="История изменений"
            @click="openHistory"
          >
            <Clock :size="14" /> История
          </button>
        </div>

        <section class="admin-panel">
          <TownForm
            :draft="draft"
            :meta="server.meta"
            :available-flags="server.flags"
          />

          <p v-if="errors.length" class="field__error">{{ errors[0] }}</p>

          <div class="row" style="flex-wrap: wrap; gap: 8px">
            <button class="btn btn--primary" type="button" :disabled="saving" @click="save">
              <Save :size="15" /> {{ saving ? 'Сохраняем…' : isNew ? 'Создать поселение' : 'Сохранить' }}
            </button>
            <button v-if="!isNew && auth.isAdmin" class="btn btn--danger btn--sm" type="button" @click="showDelete = true">
              <Trash2 :size="14" /> Удалить
            </button>
          </div>
        </section>

        <section class="admin-panel">
          <div class="row row--between">
            <span class="section-label" style="margin: 0">Границы</span>
            <span class="faint mono" style="font-size: 11.5px">{{ vertexCount }} вершин</span>
          </div>
          <div class="row" style="gap: 6px; flex-wrap: wrap">
            <button class="btn btn--sm" type="button" @click="redraw">
              <Eraser :size="14" /> Рисовать заново
            </button>
            <button class="btn btn--sm" type="button" :disabled="!vertexCount" @click="undo">
              <Undo2 :size="14" /> Отменить точку
            </button>
            <button class="btn btn--sm btn--ghost" type="button" @click="mapRef?.zoomOut()">−</button>
            <button class="btn btn--sm btn--ghost" type="button" @click="mapRef?.zoomIn()">+</button>
          </div>
          <p class="field__hint">
            <Info :size="12" style="vertical-align: -2px" />
            Клик по карте — новая вершина. Перетаскивание точки — правка. ПКМ по точке — удалить.
          </p>
        </section>
      </div>

      <section class="admin-map">
        <MapCanvas
          ref="mapRef"
          class="admin-map__canvas"
          :map="server.currentMap"
          :towns="otherTowns"
          :players="[]"
          :selected-id="null"
          :editing="true"
          :draft="initialPolygon"
          :edit-y="draft.y"
          @draft-change="onDraftChange"
        />
        <div class="admin-toolbar">
          <span class="badge badge--accent"><PencilRuler :size="11" /> режим редактирования</span>
          <span class="badge">{{ draft.world }}</span>
          <span class="badge">Y {{ draft.y }}</span>
        </div>
        <div class="admin-map__hint">
          <template v-if="vertexCount < 3">Поставьте минимум 3 вершины, чтобы замкнуть контур.</template>
          <template v-else>Контур замкнут: {{ vertexCount }} вершин. Можно сохранять.</template>
        </div>
      </section>
    </div>

    <div v-else class="login-wrap">
      <div class="stack" style="align-items: center; gap: 10px">
        <div class="spinner" />
        <span class="faint" style="font-size: 12.5px">Готовим редактор…</span>
      </div>
    </div>

    <BaseModal v-if="showDelete" title="Удалить поселение" :subtitle="draft.name" @close="showDelete = false">
      <p style="font-size: 13.5px; color: var(--text-muted)">
        Действие необратимо: зона исчезнет с карты и из Dynmap.
      </p>
      <template #footer>
        <button class="btn btn--sm" type="button" @click="showDelete = false">Отмена</button>
        <button class="btn btn--sm btn--danger" type="button" @click="remove">
          <Trash2 :size="14" /> Удалить
        </button>
      </template>
    </BaseModal>

    <BaseModal v-if="showHistory" title="История изменений" :subtitle="`${history.length} ревизий`" @close="showHistory = false">
      <div v-if="historyLoading" class="stack">
        <div v-for="index in 4" :key="index" class="skeleton" style="height: 46px" />
      </div>
      <div v-else class="stack" style="gap: 6px">
        <div v-for="entry in history" :key="entry.revision" class="history-item">
          <span class="badge badge--accent mono">v{{ entry.revision }}</span>
          <span class="grow">
            <span style="display: block; font-size: 12.5px">{{ entry.action }} · {{ entry.actor }}</span>
            <span class="faint" style="font-size: 11px">{{ formatDateTime(entry.createdAt) }}</span>
          </span>
          <button
            class="btn btn--sm"
            type="button"
            :disabled="!auth.isAdmin"
            :title="auth.isAdmin ? 'Восстановить ревизию' : 'Доступно администратору'"
            @click="restore(entry.revision)"
          >
            <RotateCcw :size="13" /> Восстановить
          </button>
        </div>
        <p v-if="!history.length" class="faint" style="font-size: 12.5px">История пуста.</p>
      </div>
    </BaseModal>
  </main>
</template>
