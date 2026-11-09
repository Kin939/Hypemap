import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'map',
      component: () => import('@/views/MapPage.vue'),
      meta: { title: 'Карта' },
    },
    {
      path: '/towns',
      name: 'towns',
      component: () => import('@/views/TownsPage.vue'),
      meta: { title: 'Поселения' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminPage.vue'),
      meta: { title: 'Админка' },
    },
    {
      path: '/admin/towns/:id',
      name: 'admin-town',
      component: () => import('@/views/AdminEditorPage.vue'),
      meta: { title: 'Редактор поселения', requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundPage.vue'),
      meta: { title: '404' },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.user && auth.token) {
    await auth.fetchMe()
  }
  if (to.meta.requiresAuth && !auth.isEditor) {
    return { name: 'admin' }
  }
  const title = (to.meta.title as string | undefined) ?? 'Hypemap'
  document.title = `${title} · Hypemap`
  return true
})

// Ошибки навигации (в т.ч. не загрузившийся чанк страницы) не должны теряться молча
router.onError((error) => {
  console.error('[router]', error)
})

export default router
