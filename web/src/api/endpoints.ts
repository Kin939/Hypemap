import { request } from './http'
import type {
  AuditEntry,
  HistoryEntry,
  KnownPlayersResponse,
  LoginResponse,
  MeResponse,
  MetaResponse,
  Town,
  TownInput,
  TownListResponse,
} from './types'

export const api = {
  meta(signal?: AbortSignal) {
    return request<MetaResponse>('/api/meta', { signal, anonymous: true })
  },

  health(signal?: AbortSignal) {
    return request<{ status: string; towns: number; dynmap: boolean }>('/api/health', {
      signal,
      anonymous: true,
    })
  },

  login(username: string, password: string) {
    return request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      anonymous: true,
    })
  },

  me(signal?: AbortSignal) {
    return request<MeResponse>('/api/auth/me', { signal })
  },

  changePassword(currentPassword: string, newPassword: string) {
    return request<{ status: string }>('/api/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    })
  },

  towns(params: { includeHidden?: boolean; world?: string } = {}, signal?: AbortSignal) {
    const search = new URLSearchParams()
    if (params.includeHidden) search.set('includeHidden', '1')
    if (params.world) search.set('world', params.world)
    const query = search.toString()
    return request<TownListResponse>(`/api/towns${query ? `?${query}` : ''}`, { signal })
  },

  town(id: string, signal?: AbortSignal) {
    return request<Town>(`/api/towns/${encodeURIComponent(id)}`, { signal })
  },

  createTown(input: TownInput) {
    return request<Town>('/api/towns', { method: 'POST', body: input })
  },

  updateTown(id: string, input: TownInput) {
    return request<Town>(`/api/towns/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
  },

  setVisibility(id: string, visible: boolean) {
    return request<Town>(`/api/towns/${encodeURIComponent(id)}/visibility`, {
      method: 'PATCH',
      body: { visible },
    })
  },

  deleteTown(id: string) {
    return request<void>(`/api/towns/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  history(id: string, limit = 30) {
    return request<{ history: HistoryEntry[]; count: number }>(
      `/api/towns/${encodeURIComponent(id)}/history?limit=${limit}`,
    )
  },

  restore(id: string, revision: number) {
    return request<Town>(`/api/towns/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: { revision },
    })
  },

  players(query: string, limit = 12, signal?: AbortSignal) {
    const search = new URLSearchParams({ q: query, limit: String(limit) })
    return request<KnownPlayersResponse>(`/api/players?${search.toString()}`, { signal })
  },

  audit(limit = 50, signal?: AbortSignal) {
    return request<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`, { signal })
  },
}
