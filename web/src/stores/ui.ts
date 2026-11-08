import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type Theme = 'dark' | 'light'
export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

const THEME_KEY = 'hypemap.theme'

export const useUiStore = defineStore('ui', () => {
  const stored = (localStorage.getItem(THEME_KEY) as Theme | null) ?? null
  const theme = ref<Theme>(stored ?? 'dark')
  const toasts = ref<Toast[]>([])
  const sidebarOpen = ref(false)
  const detailsOpen = ref(false)
  const nightPreview = ref(false)
  let toastSeq = 0

  const isDark = computed(() => theme.value === 'dark')

  function applyTheme(): void {
    document.documentElement.dataset.theme = theme.value
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme.value === 'dark' ? '#0a0e14' : '#eef1f5')
  }

  function setTheme(next: Theme): void {
    theme.value = next
    localStorage.setItem(THEME_KEY, next)
    applyTheme()
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function toast(message: string, kind: ToastKind = 'info', timeout = 4200): void {
    const id = ++toastSeq
    toasts.value.push({ id, message, kind })
    window.setTimeout(() => dismiss(id), timeout)
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function toggleSidebar(value?: boolean): void {
    sidebarOpen.value = value ?? !sidebarOpen.value
  }

  applyTheme()

  return {
    theme,
    isDark,
    toasts,
    sidebarOpen,
    detailsOpen,
    nightPreview,
    setTheme,
    toggleTheme,
    toast,
    dismiss,
    toggleSidebar,
  }
})
