/** Тонкий типизированный HTTP-клиент (fetch, без axios). */

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type TokenProvider = () => string | null

let tokenProvider: TokenProvider = () => null
let unauthorizedHandler: (() => void) | null = null

export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider
}

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Не добавлять Authorization, даже если токен есть. */
  anonymous?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (!options.anonymous) {
    const token = tokenProvider()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'same-origin',
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new ApiError(0, 'network_error', 'Сервер недоступен. Проверьте соединение.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
    if (response.status === 401 && unauthorizedHandler) unauthorizedHandler()
    throw new ApiError(
      response.status,
      error?.code || `http_${response.status}`,
      error?.message || `Ошибка запроса (HTTP ${response.status})`,
    )
  }

  return payload as T
}

export function apiBase(): string {
  return API_BASE
}
