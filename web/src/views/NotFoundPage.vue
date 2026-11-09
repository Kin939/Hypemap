<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
</script>

<template>
  <main class="page">
    <div class="page__inner" style="place-items: center; text-align: center; padding-top: 12vh">
      <div class="empty">
        <span class="empty__icon"><Compass :size="22" /></span>
        <h1 class="page__title">404 — потерялись в мире</h1>
        <p class="page__sub">Такой страницы нет. Но карта всегда рядом.</p>
        <RouterLink to="/" class="btn btn--primary">На карту</RouterLink>
      </div>
    </div>
  </main>
</template>
