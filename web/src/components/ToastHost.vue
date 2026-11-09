<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="item in ui.toasts" :key="item.id" class="toast" :class="`toast--${item.kind}`">
        <span class="toast__icon" :class="item.kind">
          <CheckCircle2 v-if="item.kind === 'success'" :size="16" />
          <XCircle v-else-if="item.kind === 'error'" :size="16" />
          <Info v-else :size="16" />
        </span>
        <span>{{ item.message }}</span>
        <button class="toast__close" type="button" aria-label="Закрыть" @click="ui.dismiss(item.id)">
          <X :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast .success {
  color: var(--accent);
}
.toast .error {
  color: var(--danger);
}
.toast .info {
  color: var(--info);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
