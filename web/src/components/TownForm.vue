<script setup lang="ts">
import { computed } from 'vue'
import { Users } from 'lucide-vue-next'
import type { TownDraft } from '@/admin/draft'
import type { MetaResponse } from '@/api/types'
import type { TownMember } from '@/api/types'
import { flagLabel } from '@/utils/format'
import ColorField from './ColorField.vue'
import MemberInput from './MemberInput.vue'

const props = defineProps<{
  draft: TownDraft
  meta: MetaResponse | null
  availableFlags: string[]
}>()

const emit = defineEmits<{ (event: 'members', value: TownMember[]): void }>()

const maxName = computed(() => props.meta?.limits.maxNameLength ?? 40)
const minName = computed(() => props.meta?.limits.minNameLength ?? 2)
const worlds = computed(() => props.meta?.server.worlds ?? ['world'])
const maxMembers = computed(() => props.meta?.limits.maxMembers ?? 64)
const flags = computed(() => (props.availableFlags.length ? props.availableFlags : props.meta?.flags ?? []))

function toggleFlag(flag: string): void {
  const index = props.draft.flags.indexOf(flag)
  if (index >= 0) props.draft.flags.splice(index, 1)
  else props.draft.flags.push(flag)
}

function setMembers(members: TownMember[]): void {
  props.draft.members = members
  emit('members', members)
}
</script>

<template>
  <div class="stack" style="gap: 18px">
    <div class="form-grid">
      <label class="field col-span-2">
        <span class="field__label">Название</span>
        <input
          v-model="draft.name"
          class="input"
          type="text"
          :maxlength="maxName"
          :placeholder="`От ${minName} до ${maxName} символов`"
          autocomplete="off"
        />
        <span class="field__hint">{{ draft.name.length }} / {{ maxName }}</span>
      </label>

      <label class="field col-span-2">
        <span class="field__label">Описание</span>
        <textarea
          v-model="draft.description"
          class="textarea"
          maxlength="500"
          placeholder="Коротко о поселении: чем живёт, кто правит, чем торгует…"
        />
      </label>

      <label class="field">
        <span class="field__label">Мир</span>
        <select v-model="draft.world" class="select">
          <option v-for="world in worlds" :key="world" :value="world">{{ world }}</option>
        </select>
      </label>

      <label class="field">
        <span class="field__label">Уровень Y</span>
        <input v-model.number="draft.y" class="input" type="number" min="-64" max="320" step="1" />
        <span class="field__hint">На какой высоте рисовать контур на изометрии</span>
      </label>
    </div>

    <div>
      <div class="section-label">Оформление</div>
      <div class="form-grid">
        <div class="field">
          <span class="field__label">Заливка</span>
          <ColorField v-model="draft.fillColor" label="Цвет заливки" />
        </div>
        <div class="field">
          <span class="field__label">Обводка</span>
          <ColorField v-model="draft.lineColor" label="Цвет обводки" />
        </div>

        <div class="field">
          <span class="field__label">Прозрачность заливки</span>
          <div class="range-row">
            <input v-model.number="draft.fillOpacity" type="range" min="0" max="1" step="0.02" />
            <span class="range-row__value">{{ Math.round(draft.fillOpacity * 100) }}%</span>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Прозрачность обводки</span>
          <div class="range-row">
            <input v-model.number="draft.lineOpacity" type="range" min="0" max="1" step="0.02" />
            <span class="range-row__value">{{ Math.round(draft.lineOpacity * 100) }}%</span>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Толщина обводки</span>
          <div class="range-row">
            <input v-model.number="draft.lineWeight" type="range" min="1" max="8" step="1" />
            <span class="range-row__value">{{ draft.lineWeight }} px</span>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Видимость на карте</span>
          <label class="switch">
            <input v-model="draft.visible" type="checkbox" />
            <span class="switch__track" />
            <span style="font-size: 12.5px">{{ draft.visible ? 'Показано всем' : 'Скрыто' }}</span>
          </label>
        </div>
      </div>
    </div>

    <div>
      <div class="section-label">Флаги поселения</div>
      <div class="chips">
        <button
          v-for="flag in flags"
          :key="flag"
          type="button"
          class="chip"
          :class="{ 'is-active': draft.flags.includes(flag) }"
          @click="toggleFlag(flag)"
        >
          {{ flagLabel(flag) }}
        </button>
      </div>
    </div>

    <div>
      <div class="section-label" style="display: flex; align-items: center; gap: 6px">
        <Users :size="11" /> Жители
        <span class="faint" style="margin-left: auto; text-transform: none; letter-spacing: 0">
          {{ draft.members.length }} / {{ maxMembers }}
        </span>
      </div>
      <MemberInput :model-value="draft.members" :max="maxMembers" @update:model-value="setMembers" />
      <p class="field__hint" style="margin-top: 6px">
        Кнопка с короной переключает владельца. Enter добавляет игрока, Backspace удаляет последнего.
      </p>
    </div>

    <div class="form-grid form-grid--3">
      <label class="field">
        <span class="field__label">Показывать с зума</span>
        <input v-model.number="draft.minZoom" class="input" type="number" min="0" max="20" />
      </label>
      <label class="field">
        <span class="field__label">Скрывать после зума</span>
        <input v-model.number="draft.maxZoom" class="input" type="number" min="0" max="20" />
      </label>
      <div class="field" style="justify-content: flex-end">
        <span class="field__hint">0 — видно всегда, 10 — только вблизи</span>
      </div>
    </div>
  </div>
</template>
