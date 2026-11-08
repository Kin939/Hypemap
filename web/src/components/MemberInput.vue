<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Crown, Plus, X } from 'lucide-vue-next'
import type { TownMember } from '@/api/types'
import { api } from '@/api/endpoints'
import { playerFaceUrl } from '@/api/dynmap'

const props = defineProps<{ modelValue: TownMember[]; max?: number }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: TownMember[]): void }>()

const input = ref('')
const suggestions = ref<string[]>([])
const activeSuggestion = ref(0)
const open = ref(false)
let timer: number | null = null
let controller: AbortController | null = null

function add(raw: string): void {
  const name = raw.trim().replace(/^,+|,+$/g, '')
  if (!name) return
  if (!/^[A-Za-z0-9_.]{2,16}$/.test(name)) return
  if (props.modelValue.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
    input.value = ''
    return
  }
  if (props.max && props.modelValue.length >= props.max) return
  const hasOwner = props.modelValue.some((member) => member.role === 'OWNER')
  emit('update:modelValue', [
    ...props.modelValue,
    { name, role: hasOwner ? 'MEMBER' : 'OWNER' },
  ])
  input.value = ''
  suggestions.value = []
  open.value = false
}

function remove(name: string): void {
  const next = props.modelValue.filter((member) => member.name !== name)
  if (next.length && !next.some((member) => member.role === 'OWNER')) next[0].role = 'OWNER'
  emit('update:modelValue', next)
}

function toggleRole(name: string): void {
  emit(
    'update:modelValue',
    props.modelValue.map((member) =>
      member.name === name
        ? { ...member, role: member.role === 'OWNER' ? 'MEMBER' : 'OWNER' }
        : member,
    ),
  )
}

function onInput(): void {
  open.value = true
  activeSuggestion.value = 0
  if (timer !== null) window.clearTimeout(timer)
  const query = input.value.trim()
  if (!query) {
    suggestions.value = []
    return
  }
  timer = window.setTimeout(async () => {
    controller?.abort()
    controller = new AbortController()
    try {
      const response = await api.players(query, 8, controller.signal)
      suggestions.value = response.players.filter(
        (name) => !props.modelValue.some((member) => member.name.toLowerCase() === name.toLowerCase()),
      )
    } catch {
      suggestions.value = []
    }
  }, 220)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
    if (open.value && suggestions.value.length && event.key !== 'Tab') {
      event.preventDefault()
      add(suggestions.value[activeSuggestion.value] ?? input.value)
      return
    }
    event.preventDefault()
    add(input.value)
    return
  }
  if (event.key === 'ArrowDown' && suggestions.value.length) {
    event.preventDefault()
    activeSuggestion.value = (activeSuggestion.value + 1) % suggestions.value.length
  }
  if (event.key === 'ArrowUp' && suggestions.value.length) {
    event.preventDefault()
    activeSuggestion.value =
      (activeSuggestion.value - 1 + suggestions.value.length) % suggestions.value.length
  }
  if (event.key === 'Backspace' && !input.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1].name)
  }
}

watch(
  () => props.modelValue.length,
  () => {
    activeSuggestion.value = 0
  },
)

onBeforeUnmount(() => {
  if (timer !== null) window.clearTimeout(timer)
  controller?.abort()
})
</script>

<template>
  <div class="tag-input">
    <span
      v-for="member in modelValue"
      :key="member.name"
      class="tag"
      :class="{ 'tag--owner': member.role === 'OWNER' }"
    >
      <img :src="playerFaceUrl(member.name)" alt="" width="16" height="16" style="border-radius: 4px" />
      {{ member.name }}
      <button
        type="button"
        :title="member.role === 'OWNER' ? 'Снять владельца' : 'Сделать владельцем'"
        @click="toggleRole(member.name)"
      >
        <Crown :size="11" :style="{ color: member.role === 'OWNER' ? 'var(--warn)' : 'inherit' }" />
      </button>
      <button type="button" title="Удалить" @click="remove(member.name)">
        <X :size="11" />
      </button>
    </span>

    <input
      v-model="input"
      type="text"
      :placeholder="modelValue.length ? 'Добавить игрока…' : 'Ник игрока, Enter'"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
      @focus="open = true"
      @blur="open = false"
    />

    <div v-if="open && suggestions.length" class="autocomplete">
      <button
        v-for="(name, index) in suggestions"
        :key="name"
        type="button"
        :class="{ 'is-active': index === activeSuggestion }"
        @mousedown.prevent="add(name)"
      >
        <img :src="playerFaceUrl(name)" alt="" />
        {{ name }}
        <Plus :size="12" style="margin-left: auto" />
      </button>
    </div>
  </div>
</template>
