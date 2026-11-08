import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/endpoints'
import { ApiError, onUnauthorized, setTokenProvider } from '@/api/http'
import type { AuthUser } from '@/api/types'
import { useUiStore } from './ui'

const TOKEN_KEY = 'hypemap.token'

export const useAuthStore = defineStore('auth', () => {
  const ui = useUiStore()
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const error = ref('')
  const localLoginEnabled = ref(true)

  setTokenProvider(() => token.value)
  onUnauthorized(() => {
    if (token.value) {
      clearSession()
      ui.toast('Сессия истекла, войдите снова', 'error')
    }
  })

  const isAuthenticated = computed(() => !!user.value)
  const isEditor = computed(() => user.value?.role === 'ADMIN' || user.value?.role === 'EDITOR')
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  function setToken(next: string | null): void {
    token.value = next
    if (next) localStorage.setItem(TOKEN_KEY, next)
    else localStorage.removeItem(TOKEN_KEY)
  }

  function clearSession(): void {
    setToken(null)
    user.value = null
  }

  function logout(): void {
    clearSession()
  }

  async function fetchMe(): Promise<void> {
    try {
      const response = await api.me()
      localLoginEnabled.value = response.auth.localLogin
      if (response.authenticated && response.user) {
        user.value = response.user
      } else {
        user.value = null
        // токен не нужен, если сервер не подтвердил сессию
        if (token.value) setToken(null)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession()
      }
      // сетевые ошибки не должны ломать публичную карту
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const response = await api.login(username.trim(), password)
      setToken(response.token)
      user.value = response.user
      return true
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'Не удалось войти'
      return false
    } finally {
      loading.value = false
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.changePassword(currentPassword, newPassword)
  }

  return {
    token,
    user,
    loading,
    error,
    localLoginEnabled,
    isAuthenticated,
    isEditor,
    isAdmin,
    login,
    logout,
    fetchMe,
    changePassword,
  }
})
