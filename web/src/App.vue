<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import ToastHost from '@/components/ToastHost.vue'
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <RouterView />
    <ToastHost />
  </div>
</template>
