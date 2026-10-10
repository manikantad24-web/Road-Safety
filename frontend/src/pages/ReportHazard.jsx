import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Crosshair, ImageUp, LocateFixed, RotateCcw, ScanSearch, Send, Trash2, CheckCircle2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useDocumentTitle } from '../hooks/useAsync'
import { useToast } from '../context'
import { HAZARD_TYPES, SEVERITIES, typeLabel } from '../lib/constants'
import { Button, Card, Field, Notice, PageHeader, Select } from '../components/ui'
import HazardMap, { MapLegend } from '../components/HazardMap'
import DetectionImage, { DetectionList } from '../components/DetectionImage'
import { useHealth } from '../components/Layout'

const MAX_MB = 8
const ACCEPT = 'image/jpeg,image/png,image/webp'
const EMPTY = { hazard_type: '', severity: '', description: '', latitude: '', longitude: '' }

function validate(f) {
  const e = {}
  if (!f.hazard_type) e.hazard_type = 'Choose the type of hazard.'
  if (!f.severity) e.severity = 'Choose how severe the hazard looks.'
  const lat = Number(f.latitude)
  const lng = Number(f.longitude)
  if (f.latitude === '' || Number.isNaN(lat)) e.latitude = 'Enter a latitude, or click the map.'
  else if (lat < -90 || lat > 90) e.latitude = 'Latitude must be between -90 and 90.'
  if (f.longitude === '' || Number.isNaN(lng)) e.longitude = 'Enter a longitude, or click the map.'
  else if (lng < -180 || lng > 180) e.longitude = 'Longitude must be between -180 and 180.'
  if (f.description.length > 1000) e.description = 'Keep the description under 1000 characters.'
  return e
}

export default function ReportHazard() {
  useDocumentTitle('Report a hazard')
  const toast = useToast()
  const { health } = useHealth()
  const fileInput = useRef(null)

  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState(false)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [fileError, setFileError] = useState('')
  const [analysis, setAnalysis] = useState(null) // DetectResponse from the server
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [created, setCreated] = useState(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const set = (k, v) => {
    const next = { ...form, [k]: v }
    setForm(next)
    if (touched) setErrors(validate(next))
  }

  const picked = useMemo(() => {
    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    return form.latitude !== '' && form.longitude !== '' && !Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
  }, [form.latitude, form.longitude])

  /* ------------------------------------------------------------- image */
  function chooseFile(f) {
    setFileError('')
    setAnalysis(null)
    setAnalysisError('')
    if (!f) return
    if (!ACCEPT.split(',').includes(f.type)) return setFileError('Use a JPEG, PNG or WebP image.')
    if (f.size > MAX_MB * 1024 * 1024) return setFileError(`This image is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB.`)
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function removeFile() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setAnalysis(null)
    setAnalysisError('')
    setFileError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function analyze() {
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const res = await api.detect(file)
      setAnalysis(res)
      if (res.analyzed && res.suggested_type && !form.hazard_type) set('hazard_type', res.suggested_type)
      if (res.analyzed) toast.success(res.detections.length ? `Model found ${res.detections.length} possible damage area${res.detections.length === 1 ? '' : 's'}.` : 'The model found no damage in this image. You can still submit a report.')
      else toast.info('The image was uploaded, but AI analysis is unavailable on this server.')
    } catch (e) {
      setAnalysisError(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  /* ---------------------------------------------------------- location */
  function useMyLocation() {
    if (!navigator.geolocation) return toast.error('This browser does not support location access. Click the map instead.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }))
        setLocating(false)
      },
      () => {
        setLocating(false)
        toast.error('Location permission was denied or unavailable. Click the map to set the location.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  /* ------------------------------------------------------------ submit */
  async function submit(ev) {
    ev.preventDefault()
    setTouched(true)
    setSubmitError('')
    const errs = validate(form)
    if (file && !analysis) errs.photo = 'Upload the photo first, or remove it, before submitting.'
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]
      document.getElementById(first === 'photo' ? 'photo' : `field-${first}`)?.focus()
      return
    }
    setSubmitting(true)
    try {
      const report = await api.createHazard({
        hazard_type: form.hazard_type,
        severity: form.severity,
        description: form.description.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        upload_id: analysis?.upload_id ?? null,
      })
      setCreated(report)
      toast.success(`Report #${report.id} submitted.`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && Object.keys(e.fieldErrors).length) setErrors((x) => ({ ...x, ...e.fieldErrors }))
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    removeFile()
    setForm(EMPTY)
    setErrors({})
    setTouched(false)
    setCreated(null)
    setSubmitError('')
  }

  /* ---------------------------------------------------------- success */
  if (created) {
    return (
      <>
        <PageHeader title="Report a hazard" />
        <div className="panel mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-teal-400/15 text-teal-300">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="text-xl font-semibold text-white">Report #{created.id} submitted</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mist-300">
            Your {typeLabel(created.hazard_type).toLowerCase()} report is now on the map. It becomes verified once enough other people confirm it{health?.verify_threshold ? ` (${health.verify_threshold} confirmations)` : ''}, or when an authority reviews it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to={`/reports/${created.id}`}><Button variant="primary">View report</Button></Link>
            <Link to="/map"><Button>See it on the map</Button></Link>
            <Button icon={RotateCcw} onClick={reset}>Report another</Button>
          </div>
        </div>
      </>
    )
  }

  const aiUnavailable = health && !health.ai.available
  const showUnavailableResult = analysis && !analysis.analyzed

  return (
    <>
      <PageHeader title="Report a hazard" description="Add a photo if you have one, then describe the hazard and mark where it is. The more precise the location, the more useful the report is to other drivers." />

      {aiUnavailable && (
        <Notice kind="warn" title="AI image analysis is not available on this server" className="mb-6">
          No road-damage model is installed, so photos will be stored but not analysed. You can still submit a manual report: you choose the type and severity yourself. {health.ai.reason}
        </Notice>
      )}

      <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-2">
        {/* ------------------------------------------------ left column */}
        <div className="space-y-6">
          <Card title="Photo" description="Optional. JPEG, PNG or WebP up to 8 MB. Location data embedded in photos is removed on upload.">
            {!file ? (
              <label
                htmlFor="photo"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-500 bg-ink-900/50 px-6 py-10 text-center transition-colors hover:border-teal-500/60 hover:bg-ink-900"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]) }}
              >
                <ImageUp className="h-7 w-7 text-teal-300" aria-hidden />
                <span className="text-sm font-medium text-white">Choose a road photo or drop it here</span>
                <span className="text-xs text-mist-400">Take it from a safe place, and never while driving.</span>
                <input ref={fileInput} id="photo" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0])} />
              </label>
            ) : (
              <div className="space-y-4">
                {analysis?.analyzed ? (
                  <DetectionImage src={preview} alt="Uploaded road photo with detected damage outlined" detections={analysis.detections} />
                ) : (
                  <img src={preview} alt="Preview of the selected road photo" className="max-h-[28rem] w-full rounded-lg bg-ink-900 object-contain" />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" icon={ScanSearch} loading={analyzing} disabled={Boolean(analysis)} onClick={analyze}>
                    {analysis ? (analysis.analyzed ? 'Analysis complete' : 'Photo uploaded') : aiUnavailable ? 'Upload photo' : 'Upload and run AI detection'}
                  </Button>
                  <Button variant="ghost" icon={Trash2} onClick={removeFile}>Remove photo</Button>
                  <span className="truncate text-xs text-mist-400">{file.name} · {(file.size / 1048576).toFixed(2)} MB</span>
                </div>
                {!analysis && !analyzing && <p className="text-xs text-mist-400">Uploading attaches the photo to your report. You must upload it before submitting.</p>}
              </div>
            )}
            {(fileError || errors.photo) && <p className="field-error" role="alert">{fileError || errors.photo}</p>}
            {analysisError && <Notice kind="error" title="Upload failed" className="mt-4">{analysisError}</Notice>}

            {showUnavailableResult && (
              <Notice kind="warn" title="Photo attached, but not analysed" className="mt-4">
                {analysis.reason} Your report will be labelled as a manual report with an unanalysed photo.
              </Notice>
            )}

            {analysis?.analyzed && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-white">
                  <Cpu className="h-4 w-4 text-teal-300" aria-hidden />
                  <span className="font-medium">Detected by {analysis.model}</span>
                </div>
                {analysis.detections.length ? (
                  <DetectionList detections={analysis.detections} currentType={form.hazard_type} onUse={(t) => set('hazard_type', t)} />
                ) : (
                  <p className="rounded-lg border border-ink-600 bg-ink-900/50 px-3 py-3 text-sm text-mist-300">
                    The model did not find damage in this image. That does not prove the road is fine. Pick the type yourself if you can see a hazard.
                  </p>
                )}
                <p className="text-xs leading-relaxed text-mist-400">{analysis.disclaimer}</p>
              </div>
            )}
          </Card>

          <Card title="Location" description="Click the map, use your current position, or type coordinates.">
            <div className="space-y-4">
              <HazardMap
                className="h-[300px]"
                center={picked ? [picked.lat, picked.lng] : undefined}
                zoom={16}
                onPick={({ lat, lng }) => {
                  setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))
                  setErrors((x) => ({ ...x, latitude: undefined, longitude: undefined }))
                }}
                picked={picked}
                flyTo={picked ? [picked.lat, picked.lng] : null}
                label="Map for choosing the hazard location. Click to place the marker."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Latitude" htmlFor="field-latitude" error={errors.latitude} required>
                  <input id="field-latitude" inputMode="decimal" className="input" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} aria-invalid={Boolean(errors.latitude)} aria-describedby={errors.latitude ? 'field-latitude-error' : undefined} placeholder="18.520400" />
                </Field>
                <Field label="Longitude" htmlFor="field-longitude" error={errors.longitude} required>
                  <input id="field-longitude" inputMode="decimal" className="input" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} aria-invalid={Boolean(errors.longitude)} aria-describedby={errors.longitude ? 'field-longitude-error' : undefined} placeholder="73.856700" />
                </Field>
              </div>
              <Button icon={LocateFixed} loading={locating} onClick={useMyLocation}>Use my current location</Button>
            </div>
          </Card>
        </div>

        {/* ----------------------------------------------- right column */}
        <div className="space-y-6">
          <Card title="Hazard details">
            <div className="space-y-5">
              <Field label="Hazard type" htmlFor="field-hazard_type" error={errors.hazard_type} required hint={analysis?.suggested_type && form.hazard_type !== analysis.suggested_type ? `The AI suggested ${typeLabel(analysis.suggested_type).toLowerCase()}. Your choice is saved, and the report notes that you changed it.` : undefined}>
                <Select id="field-hazard_type" value={form.hazard_type} onChange={(e) => set('hazard_type', e.target.value)} options={HAZARD_TYPES} placeholder="Select a type" aria-invalid={Boolean(errors.hazard_type)} aria-describedby={errors.hazard_type ? 'field-hazard_type-error' : undefined} />
              </Field>

              <fieldset aria-describedby={errors.severity ? 'severity-error' : undefined}>
                <legend className="label">Severity <span className="text-sev-high" aria-hidden>*</span></legend>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Severity">
                  {SEVERITIES.map((s) => (
                    <label key={s.value} className={`cursor-pointer rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal-400 ${form.severity === s.value ? 'border-teal-400 bg-teal-400/10' : 'border-ink-600 bg-ink-900/50 hover:border-ink-500'}`}>
                      <input id={s.value === 'low' ? 'field-severity' : undefined} type="radio" name="severity" value={s.value} checked={form.severity === s.value} onChange={() => set('severity', s.value)} className="sr-only" />
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                        {s.label}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-mist-400">{s.help}</span>
                    </label>
                  ))}
                </div>
                {errors.severity && <p className="field-error" id="severity-error" role="alert">{errors.severity}</p>}
                <p className="hint">Image detection alone cannot establish how dangerous a hazard is. Use your own judgement.</p>
              </fieldset>

              <Field label="Description" htmlFor="field-description" error={errors.description} hint={`${form.description.length}/1000. Mention the lane, nearby landmark, or anything that makes it hard to see.`}>
                <textarea id="field-description" rows={4} maxLength={1100} className="input resize-y" value={form.description} onChange={(e) => set('description', e.target.value)} aria-invalid={Boolean(errors.description)} placeholder="For example: deep pothole in the left lane just after the signal" />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              {submitError && <Notice kind="error" title="Report not submitted">{submitError}</Notice>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" icon={Send} loading={submitting} disabled={analyzing}>Submit report</Button>
                <Button variant="ghost" icon={RotateCcw} onClick={reset} disabled={submitting}>Clear form</Button>
              </div>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-mist-400">
                <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {analysis?.analyzed ? `Report will include the ${analysis.model} detections.` : file && analysis ? 'Report will be labelled as manual, with an unanalysed photo.' : 'Report will be labelled as a manual report.'} Reports are public and visible to everyone using this application.
              </p>
            </div>
          </Card>
          <MapLegend />
        </div>
      </form>
    </>
  )
}
