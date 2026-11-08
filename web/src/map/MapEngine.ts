import L from 'leaflet'
import type { Coords } from 'leaflet'
import type { DynmapPlayer, MapDefinition, Town, TownPoint } from '@/api/types'
import {
  latLngToLocation,
  locationToLatLng,
  polygonToLatLngs,
  tileLayerOptions,
  tileUrl,
} from './dynmapMath'

export interface MapView {
  x: number
  z: number
  zoom: number
}

export interface MapEngineCallbacks {
  onTownClick?: (id: string) => void
  onViewChange?: (view: MapView) => void
  onDraftChange?: (points: TownPoint[]) => void
  onPlayerClick?: (player: DynmapPlayer) => void
  onBackgroundClick?: (world: { x: number; z: number }) => void
}

interface PlayerState {
  marker: L.Marker
  from: L.LatLng
  to: L.LatLng
  startedAt: number
  duration: number
}

const PLAYER_ANIMATION_MS = 900
const DRAFT_STYLE = { color: '#34d399', weight: 2, dashArray: '6 5', fillOpacity: 0.12 }

/** Кастомный слой тайлов Dynmap: URL считается по его собственной схеме. */
class DynmapTileLayer extends L.TileLayer {
  private readonly def: MapDefinition
  private isDay = true

  constructor(def: MapDefinition) {
    super('', tileLayerOptions(def))
    this.def = def
    this.setZIndex(10)
  }

  override getTileUrl(coords: Coords): string {
    return tileUrl(this.def, coords, this.isDay)
  }

  setDay(day: boolean): void {
    if (this.isDay === day) return
    this.isDay = day
    this.redraw()
  }
}

/**
 * Обёртка над Leaflet: тайлы Dynmap, полигоны поселений, игроки,
 * плавное движение маркеров и режим рисования полигона.
 */
export class MapEngine {
  private readonly map: L.Map
  private readonly callbacks: MapEngineCallbacks
  private readonly faceUrl: (name: string) => string

  private def: MapDefinition | null = null
  private tileLayer: DynmapTileLayer | null = null

  private readonly townGroup: L.LayerGroup
  private readonly playerGroup: L.LayerGroup
  private readonly editGroup: L.LayerGroup
  private readonly townLayers = new Map<string, L.Polygon>()
  private readonly playerStates = new Map<string, PlayerState>()
  private selectedId: string | null = null
  private animationFrame = 0

  private editing = false
  private draft: TownPoint[] = []
  private draftY = 64
  private draftPolygon: L.Polygon | null = null
  private draftPolyline: L.Polyline | null = null
  private draftMarkers: L.Marker[] = []

  constructor(container: HTMLElement, faceUrl: (name: string) => string, callbacks: MapEngineCallbacks = {}) {
    this.callbacks = callbacks
    this.faceUrl = faceUrl
    this.map = L.map(container, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      minZoom: 0,
      maxZoom: 4,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      worldCopyJump: false,
      preferCanvas: false,
    })
    this.map.setView([0, 0], 1)

    this.townGroup = L.layerGroup().addTo(this.map)
    this.playerGroup = L.layerGroup().addTo(this.map)
    this.editGroup = L.layerGroup().addTo(this.map)

    this.map.on('moveend zoomend', () => this.emitView())
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.editing) {
        this.addDraftPointFromLatLng(event.latlng)
        return
      }
      if (this.callbacks.onBackgroundClick && this.def) {
        const world = latLngToLocation(this.def, event.latlng.lat, event.latlng.lng, this.draftY)
        this.callbacks.onBackgroundClick({ x: world.x, z: world.z })
      }
    })
  }

  /* ------------------------------------------------------------------ layers */

  setMap(def: MapDefinition): void {
    const previous = this.def
    this.def = def

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer)
      this.tileLayer = null
    }

    this.map.setMinZoom(def.minZoom)
    this.map.setMaxZoom(def.maxZoom)

    this.tileLayer = new DynmapTileLayer(def)
    this.tileLayer.addTo(this.map)

    if (!previous) {
      const center = locationToLatLng(def, def.center)
      this.map.setView(center, Math.min(def.maxZoom, 2))
      this.emitView()
    } else {
      // при смене карты сохраняем мировые координаты в центре
      const world = latLngToLocation(previous, this.map.getCenter().lat, this.map.getCenter().lng, 64)
      this.map.setView(locationToLatLng(def, world), Math.min(this.map.getZoom(), def.maxZoom))
    }

    this.rerenderWorldLayers()
  }

  private rerenderWorldLayers(): void {
    // После смены проекции координаты всех объектов нужно пересчитать.
    const towns = Array.from(this.townLayers.keys())
    if (towns.length) {
      const cached = this.townCache
      this.townCache = null
      if (cached) this.setTowns(cached)
    }
    if (this.editing) this.renderDraft()
  }

  private townCache: Town[] | null = null

  setTowns(towns: Town[]): void {
    this.townCache = towns
    if (!this.def) return
    const alive = new Set<string>()

    for (const town of towns) {
      alive.add(town.id)
      const latlngs = polygonToLatLngs(this.def, town.polygon, town.y)
      let layer = this.townLayers.get(town.id)

      if (!layer) {
        layer = L.polygon(latlngs, {
          color: town.lineColor,
          weight: town.lineWeight,
          opacity: town.lineOpacity,
          fillColor: town.fillColor,
          fillOpacity: town.fillOpacity,
          lineJoin: 'round',
          lineCap: 'round',
          bubblingMouseEvents: false,
        })
        layer.on('click', () => this.callbacks.onTownClick?.(town.id))
        layer.on('add', () => layer?.bringToFront())
        layer.addTo(this.townGroup)
        this.townLayers.set(town.id, layer)
      } else {
        layer.setLatLngs(latlngs)
      }

      layer.setStyle(this.styleFor(town))
      layer.bindTooltip(town.name, {
        permanent: true,
        direction: 'center',
        className: 'town-tip',
        opacity: 1,
        interactive: false,
      })
      layer.off('mouseover mouseout')
      layer.on('mouseover', () => {
        if (this.selectedId === town.id) return
        layer?.setStyle({ fillOpacity: Math.min(1, town.fillOpacity + 0.14) })
      })
      layer.on('mouseout', () => layer?.setStyle(this.styleFor(town)))
    }

    for (const [id, layer] of this.townLayers) {
      if (!alive.has(id)) {
        this.townGroup.removeLayer(layer)
        this.townLayers.delete(id)
      }
    }

    if (this.selectedId) this.bringSelectedToFront()
  }

  private styleFor(town: Town): L.PathOptions {
    const selected = this.selectedId === town.id
    return {
      color: town.lineColor,
      weight: selected ? town.lineWeight + 1.5 : town.lineWeight,
      opacity: town.lineOpacity,
      fillColor: town.fillColor,
      fillOpacity: selected ? Math.min(1, town.fillOpacity + 0.16) : town.fillOpacity,
      dashArray: selected ? undefined : undefined,
    }
  }

  private bringSelectedToFront(): void {
    const layer = this.selectedId ? this.townLayers.get(this.selectedId) : null
    layer?.bringToFront()
  }

  setSelected(id: string | null): void {
    this.selectedId = id
    if (!this.townCache) return
    for (const town of this.townCache) {
      const layer = this.townLayers.get(town.id)
      if (layer) layer.setStyle(this.styleFor(town))
    }
    this.bringSelectedToFront()
  }

  /* ----------------------------------------------------------------- players */

  setPlayers(players: DynmapPlayer[]): void {
    if (!this.def) return
    const alive = new Set<string>()

    for (const player of players) {
      const key = player.account || player.name
      alive.add(key)
      const target = L.latLng(...locationToLatLng(this.def, player))
      const existing = this.playerStates.get(key)

      if (existing) {
        existing.from = existing.marker.getLatLng()
        existing.to = target
        existing.startedAt = performance.now()
        existing.duration = PLAYER_ANIMATION_MS
        existing.marker.setPopupContent(this.popupHtml(player))
      } else {
        const marker = this.createPlayerMarker(player, target)
        this.playerStates.set(key, {
          marker,
          from: target,
          to: target,
          startedAt: 0,
          duration: 0,
        })
      }
    }

    for (const [key, state] of this.playerStates) {
      if (!alive.has(key)) {
        this.playerGroup.removeLayer(state.marker)
        this.playerStates.delete(key)
      }
    }

    this.startAnimation()
  }

  private createPlayerMarker(player: DynmapPlayer, latlng: L.LatLng): L.Marker {
    const name = player.name || player.account
    const html = `
      <div class="player-marker" title="${escapeHtml(name)}">
        <span class="player-marker__ring"></span>
        <img class="player-marker__avatar" src="${this.faceUrl(player.account || name)}" alt="" loading="lazy" />
        <span class="player-label">${escapeHtml(name)}</span>
      </div>`
    const marker = L.marker(latlng, {
      icon: L.divIcon({ className: 'player-icon', html, iconSize: [34, 34], iconAnchor: [17, 17] }),
      keyboard: false,
      riseOnHover: true,
      zIndexOffset: 500,
    })
    marker.bindPopup(this.popupHtml(player), { closeButton: true, offset: [0, -8] })
    marker.on('click', () => this.callbacks.onPlayerClick?.(player))
    marker.addTo(this.playerGroup)
    return marker
  }

  private popupHtml(player: DynmapPlayer): string {
    const name = escapeHtml(player.name || player.account)
    const health = Math.round((player.health ?? 0) * 10) / 10
    const armor = Math.round(player.armor ?? 0)
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <img src="${this.faceUrl(player.account || player.name)}" width="24" height="24"
             style="border-radius:6px;image-rendering:pixelated" alt="" />
        <strong>${name}</strong>
      </div>
      <div class="mono" style="font-size:11.5px;line-height:1.6">
        x ${Math.round(player.x)} · y ${Math.round(player.y)} · z ${Math.round(player.z)}<br />
        ❤ ${health} · 🛡 ${armor}
      </div>`
  }

  private startAnimation(): void {
    if (this.animationFrame) return
    const step = (now: number) => {
      let active = false
      for (const state of this.playerStates.values()) {
        if (state.duration <= 0) continue
        const progress = Math.min(1, (now - state.startedAt) / state.duration)
        const ease = 1 - Math.pow(1 - progress, 3)
        const lat = state.from.lat + (state.to.lat - state.from.lat) * ease
        const lng = state.from.lng + (state.to.lng - state.from.lng) * ease
        state.marker.setLatLng([lat, lng])
        if (progress >= 1) state.duration = 0
        else active = true
      }
      this.animationFrame = active ? requestAnimationFrame(step) : 0
    }
    this.animationFrame = requestAnimationFrame(step)
  }

  /* -------------------------------------------------------------------- view */

  setDay(day: boolean): void {
    this.tileLayer?.setDay(day)
  }

  setNightPreview(enabled: boolean): void {
    const pane = this.map.getPane('tilePane')
    if (pane) pane.style.filter = enabled ? 'brightness(0.55) saturate(0.75) hue-rotate(195deg)' : ''
  }

  focusTown(town: Town): void {
    if (!this.def || !town.polygon.length) return
    const latlngs = polygonToLatLngs(this.def, town.polygon, town.y)
    const bounds = L.latLngBounds(latlngs)
    this.map.flyToBounds(bounds, {
      padding: [70, 70],
      maxZoom: this.def.maxZoom,
      duration: 0.7,
    })
  }

  focusLocation(x: number, z: number, y: number, zoom?: number): void {
    if (!this.def) return
    this.map.flyTo(locationToLatLng(this.def, { x, y, z }), zoom ?? Math.max(this.map.getZoom(), 1), {
      duration: 0.6,
    })
  }

  zoomIn(): void {
    this.map.zoomIn()
  }

  zoomOut(): void {
    this.map.zoomOut()
  }

  invalidate(): void {
    this.map.invalidateSize({ animate: false })
  }

  getZoom(): number {
    return this.map.getZoom()
  }

  private emitView(): void {
    if (!this.def || !this.callbacks.onViewChange) return
    const center = this.map.getCenter()
    const world = latLngToLocation(this.def, center.lat, center.lng, this.draftY)
    this.callbacks.onViewChange({ x: world.x, z: world.z, zoom: this.map.getZoom() })
  }

  /* -------------------------------------------------------------------- edit */

  startEditing(points: TownPoint[] = [], y = 64): void {
    this.editing = true
    this.draftY = y
    this.draft = points.map((p) => ({ x: p.x, z: p.z }))
    this.map.getContainer().classList.add('is-editing')
    this.renderDraft()
    this.emitDraft()
  }

  stopEditing(): void {
    this.editing = false
    this.map.getContainer().classList.remove('is-editing')
    this.clearDraftLayers()
  }

  isEditing(): boolean {
    return this.editing
  }

  getDraft(): TownPoint[] {
    return this.draft.map((p) => ({ x: p.x, z: p.z }))
  }

  undoDraft(): void {
    this.draft.pop()
    this.renderDraft()
    this.emitDraft()
  }

  clearDraft(): void {
    this.draft = []
    this.renderDraft()
    this.emitDraft()
  }

  setDraftY(y: number): void {
    this.draftY = y
    this.renderDraft()
  }

  private addDraftPointFromLatLng(latlng: L.LatLng): void {
    if (!this.def) return
    const world = latLngToLocation(this.def, latlng.lat, latlng.lng, this.draftY)
    this.draft.push({ x: world.x, z: world.z })
    this.renderDraft()
    this.emitDraft()
  }

  private clearDraftLayers(): void {
    this.editGroup.clearLayers()
    this.draftMarkers = []
    this.draftPolygon = null
    this.draftPolyline = null
  }

  private renderDraft(): void {
    if (!this.def) return
    this.clearDraftLayers()
    if (!this.editing) return

    const latlngs = polygonToLatLngs(this.def, this.draft, this.draftY)

    if (latlngs.length >= 3) {
      this.draftPolygon = L.polygon(latlngs, {
        color: DRAFT_STYLE.color,
        weight: 2,
        opacity: 0.95,
        fillColor: '#34d399',
        fillOpacity: 0.14,
        dashArray: DRAFT_STYLE.dashArray,
        bubblingMouseEvents: false,
      }).addTo(this.editGroup)
    } else if (latlngs.length >= 2) {
      this.draftPolyline = L.polyline(latlngs, {
        color: DRAFT_STYLE.color,
        weight: 2,
        opacity: 0.95,
        dashArray: DRAFT_STYLE.dashArray,
        bubblingMouseEvents: false,
      }).addTo(this.editGroup)
    }

    latlngs.forEach((latlng, index) => {
      const marker = L.marker(latlng, {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({
          className: 'vertex-icon',
          html: `<span class="vertex" data-index="${index}"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        zIndexOffset: 900,
      })
      marker.on('drag', (event: L.LeafletEvent) => {
        if (!this.def) return
        const position = (event.target as L.Marker).getLatLng()
        const world = latLngToLocation(this.def, position.lat, position.lng, this.draftY)
        this.draft[index] = { x: world.x, z: world.z }
        const updated = polygonToLatLngs(this.def, this.draft, this.draftY)
        this.draftPolygon?.setLatLngs(updated)
        this.draftPolyline?.setLatLngs(updated)
      })
      marker.on('dragend', () => this.emitDraft())
      marker.on('contextmenu', (event: L.LeafletEvent) => {
        L.DomEvent.stopPropagation(event)
        this.draft.splice(index, 1)
        this.renderDraft()
        this.emitDraft()
      })
      marker.addTo(this.editGroup)
      this.draftMarkers.push(marker)
    })
  }

  private emitDraft(): void {
    this.callbacks.onDraftChange?.(this.getDraft())
  }

  /* ------------------------------------------------------------------ cleanup */

  destroy(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame)
    this.map.remove()
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
