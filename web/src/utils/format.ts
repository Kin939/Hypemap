const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: number | string | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

export function formatDateTime(value: number | string | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}

export function formatArea(area: number): string {
  if (!Number.isFinite(area) || area <= 0) return '0 блоков²'
  if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} млн блоков²`
  if (area >= 10_000) return `${(area / 1000).toFixed(1)}k блоков²`
  return `${formatNumber(area)} блоков²`
}

export function formatCoord(value: number): string {
  return Math.round(value).toString()
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 5_000) return 'только что'
  if (diff < 60_000) return `${Math.floor(diff / 1000)} с назад`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`
  return formatDateTime(timestamp)
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(52, 211, 153, ${alpha})`
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const FLAG_LABELS: Record<string, string> = {
  PVP: 'PvP',
  PEACEFUL: 'Мирная зона',
  PUBLIC: 'Открыто всем',
  CAPITAL: 'Столица',
  SHOP: 'Торговля',
  FARM: 'Фермы',
  MINING: 'Шахты',
  PORT: 'Порт',
}

export function flagLabel(flag: string): string {
  return FLAG_LABELS[flag] ?? flag
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  EDITOR: 'Редактор',
  VIEWER: 'Наблюдатель',
}
