<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { X } from 'lucide-vue-next'

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ (event: 'close'): void }>()

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" @click.self="emit('close')">
    <div class="modal">
      <div class="modal__head">
        <div>
          <div class="modal__title">{{ title }}</div>
          <div v-if="subtitle" class="faint" style="font-size: 12px; margin-top: 2px">{{ subtitle }}</div>
        </div>
        <button class="icon-btn icon-btn--sm" type="button" aria-label="Закрыть" @click="emit('close')">
          <X :size="15" />
        </button>
      </div>
      <div class="modal__body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="modal__foot">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
