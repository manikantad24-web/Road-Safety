import { memo, useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { severityMeta, typeLabel } from '../lib/constants'
import { assetUrl } from '../lib/api'
import { timeAgo } from '../lib/format'
import { DemoBadge, SeverityBadge, StatusBadge } from './ui'

export const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
const WORLD_CENTER = [20, 0]

/* ------------------------------------------------------------ marker icons */
const iconCache = new Map()

/**
 * Severity -> shape + colour (circle / diamond / triangle).
 * Status  -> outline: verified = white ring, in progress = dashed ring, resolved/rejected = faded.
 */
export function hazardIcon(severity, status, highlighted = false) {
  const key = `${severity}|${status}|${highlighted}`
  if (iconCache.has(key)) return iconCache.get(key)
  const color = severityMeta(severity).color
  const size = severity === 'high' ? 30 : severity === 'medium' ? 26 : 22
  const faded = status === 'resolved' || status === 'rejected'
  const stroke = status === 'verified' ? '#ffffff' : status === 'in_progress' ? '#e8eef7' : '#0a1424'
  const dash = status === 'in_progress' ? 'stroke-dasharray="2.2 1.8"' : ''
  const sw = status === 'verified' ? 1.8 : 1.4
  const shape =
    severity === 'high'
      ? `<path d="M12 2.6 22 20.6H2z" fill="${color}" stroke="${stroke}" stroke-width="${sw}" ${dash} stroke-linejoin="round"/>`
      : severity === 'medium'
        ? `<path d="M12 2 22 12 12 22 2 12z" fill="${color}" stroke="${stroke}" stroke-width="${sw}" ${dash} stroke-linejoin="round"/>`
        : `<circle cx="12" cy="12" r="8.6" fill="${color}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`
  const check = status === 'resolved' ? `<path d="m8 12.3 2.8 2.8L16.4 9" fill="none" stroke="#0a1424" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''
  const pulse = severity === 'high' && !faded ? '<span class="rg-pin-pulse"></span>' : ''
  const ring = highlighted ? `<span style="position:absolute;inset:-5px;border:2px solid #34d3c0;border-radius:9999px"></span>` : ''
  const icon = L.divIcon({
    className: 'rg-marker',
    html: `<div style="position:relative;width:${size}px;height:${size}px;opacity:${faded ? 0.5 : 1}">${pulse}${ring}<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">${shape}${check}</svg></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
  iconCache.set(key, icon)
  return icon
}

function pinIcon(label, color = '#34d3c0') {
  return L.divIcon({
    className: 'rg-marker',
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${color};color:#07101e;font-weight:700;font-size:13px;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.5)">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}
export const pointIcon = pinIcon

/* ----------------------------------------------------------- map helpers */
function FitBounds({ bounds, padding = 36, maxZoom = 16 }) {
  const map = useMap()
  const key = bounds ? JSON.stringify(bounds) : ''
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [padding, padding], maxZoom, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView(target, Math.max(map.getZoom(), 15))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.[0], target?.[1]])
  return null
}

function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Recompute size when the container changes (sidebar/layout shifts). */
function Resize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

/* ------------------------------------------------------------------ popup */
export function HazardPopupContent({ hazard: h }) {
  return (
    <div className="w-[15rem]">
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={h.severity} />
        <StatusBadge status={h.status} />
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{typeLabel(h.hazard_type)}</p>
      <p className="text-xs text-mist-400">
        Reported {timeAgo(h.created_at)} · {h.confirm_count} confirmation{h.confirm_count === 1 ? '' : 's'}
        {h.flag_count > 0 && ` · ${h.flag_count} flagged`}
      </p>
      {h.image_url && <img src={assetUrl(h.image_url)} alt={`Report photo of ${typeLabel(h.hazard_type).toLowerCase()}`} className="mt-2 h-24 w-full rounded-md object-cover" loading="lazy" />}
      {h.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-mist-200">{h.description}</p>}
      <div className="mt-3 flex items-center justify-between">
        {h.is_demo ? <DemoBadge /> : <span />}
        <Link to={`/reports/${h.id}`} className="text-xs font-semibold text-teal-300 hover:text-teal-200">
          Open report
        </Link>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- the map */
function HazardMapBase({
  hazards = [],
  className = 'h-[420px]',
  bounds,
  center,
  zoom = 13,
  onPick,
  picked,
  selectedId,
  flyTo,
  scrollWheelZoom = true,
  interactive = true,
  children,
  label = 'Map of reported road hazards',
}) {
  const fitTo = useMemo(() => {
    if (bounds) return bounds
    if (!center && hazards.length) {
      const pts = hazards.map((h) => [h.latitude, h.longitude])
      return [
        [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
        [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
      ]
    }
    return null
  }, [bounds, center, hazards])

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-ink-600/70 ${className} rg-map-isolated`}
      role="region"
      aria-label={label}
      onWheel={(event) => {
        // Keep Ctrl/Command + wheel gestures from zooming the browser/app while
        // interacting with the map. Leaflet still handles normal wheel zoom.
        if (event.ctrlKey || event.metaKey) event.preventDefault()
      }}
    >
      <MapContainer
        center={center || WORLD_CENTER}
        zoom={center ? zoom : 2}
        scrollWheelZoom={scrollWheelZoom}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        className="h-full w-full"
        worldCopyJump
      >
        <TileLayer url={SATELLITE_URL} attribution={SATELLITE_ATTRIBUTION} maxZoom={19} />
        <Resize />
        {fitTo && <FitBounds bounds={fitTo} />}
        {flyTo && <FlyTo target={flyTo} />}
        {onPick && <ClickPicker onPick={onPick} />}
        {hazards.map((h) => (
          <Marker key={h.id} position={[h.latitude, h.longitude]} icon={hazardIcon(h.severity, h.status, h.id === selectedId)} keyboard title={`${typeLabel(h.hazard_type)}, ${h.severity} severity, ${h.status}`}>
            <Popup>
              <HazardPopupContent hazard={h} />
            </Popup>
          </Marker>
        ))}
        {picked && <Marker position={[picked.lat, picked.lng]} icon={pinIcon('+')} />}
        {children}
      </MapContainer>
    </div>
  )
}

export default memo(HazardMapBase)

/* ----------------------------------------------------------------- legend */
export function MapLegend({ compact = false }) {
  const sev = ['low', 'medium', 'high']
  return (
    <div className={`rounded-lg border border-ink-600/70 bg-ink-850/80 text-xs text-mist-300 ${compact ? 'p-3' : 'p-4'}`}>
      <p className="mb-2 font-medium text-mist-100">Marker key</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {sev.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              {s === 'high' ? <path d="M12 2.6 22 20.6H2z" fill={severityMeta(s).color} /> : s === 'medium' ? <path d="M12 2 22 12 12 22 2 12z" fill={severityMeta(s).color} /> : <circle cx="12" cy="12" r="8.6" fill={severityMeta(s).color} />}
            </svg>
            {severityMeta(s).label} severity
          </span>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        <li>White outline: verified</li>
        <li>Dashed outline: repair in progress</li>
        <li>Faded with a tick: resolved</li>
        <li>Pulsing: high severity, still open</li>
      </ul>
    </div>
  )
}
