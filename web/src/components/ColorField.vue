<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  label?: string
}>()

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()

const value = computed({
  get: () => props.modelValue,
  set: (next: string) => emit('update:modelValue', next),
})

function normalize(raw: string): void {
  const trimmed = raw.trim()
  if (!trimmed) return
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    emit('update:modelValue', withHash.toLowerCase())
  } else {
    emit('update:modelValue', withHash)
  }
}
</script>

<template>
  <div class="color-field">
    <label class="color-field__swatch" :style="{ background: value }" :title="label || 'Выбрать цвет'">
      <input
        type="color"
        :value="/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#22c55e'"
        @input="emit('update:modelValue', (($event.target as HTMLInputElement).value as string).toLowerCase())"
      />
    </label>
    <input
      class="input input--mono"
      type="text"
      :value="value"
      maxlength="7"
      spellcheck="false"
      @change="normalize(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
