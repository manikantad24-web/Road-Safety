import { typeLabel } from '../lib/constants'
import { pct } from '../lib/format'

/** Shows an image with the model's bounding boxes drawn from the real detection output. */
export default function DetectionImage({ src, alt, detections = [], className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-ink-900 ${className}`}>
      <img src={src} alt={alt} className="block h-auto max-h-[28rem] w-full object-contain" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {detections.map((d, i) => (
          <div
            key={i}
            className="absolute rounded-sm border-2 border-teal-300"
            style={{ left: `${d.box.x1 * 100}%`, top: `${d.box.y1 * 100}%`, width: `${(d.box.x2 - d.box.x1) * 100}%`, height: `${(d.box.y2 - d.box.y1) * 100}%`, boxShadow: '0 0 0 1px rgba(7,16,30,.8)' }}
          >
            <span className="absolute -top-px left-0 -translate-y-full whitespace-nowrap rounded-t bg-teal-300 px-1.5 py-0.5 text-[10px] font-semibold text-ink-950">
              {d.label} {pct(d.confidence)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetectionList({ detections, onUse, currentType }) {
  if (!detections.length) return null
  return (
    <ul className="divide-y divide-ink-600/60 rounded-lg border border-ink-600/70" aria-label="Detected damage">
      {detections.map((d, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-white">{d.label}</p>
            <p className="text-xs text-mist-400">Maps to: {typeLabel(d.hazard_type)}</p>
          </div>
          <div className="w-28" aria-label={`Confidence ${pct(d.confidence)}`}>
            <div className="flex justify-between text-xs text-mist-300">
              <span>Confidence</span>
              <span className="tabular-nums text-white">{pct(d.confidence)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-ink-600">
              <div className="h-full rounded-full bg-teal-400" style={{ width: pct(d.confidence) }} />
            </div>
          </div>
          {onUse && (
            <button
              type="button"
              onClick={() => onUse(d.hazard_type)}
              disabled={currentType === d.hazard_type}
              className="rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-mist-100 hover:bg-ink-700 disabled:cursor-default disabled:border-teal-600/50 disabled:text-teal-300"
            >
              {currentType === d.hazard_type ? 'Selected' : 'Use this type'}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
