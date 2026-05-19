import {
  type ChangeEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { fetchPrintSpec } from '../verify/fetchPrintSpec'
import {
  fetchAndParseGripCaseClip,
  type SvgShapeResult,
} from '../verify/parseSvgPath'

const IMAGE_MIN_SCALE = 0.1
const IMAGE_MAX_SCALE = 4
const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

type ImageTransform = {
  centerX: number
  centerY: number
  imageWidth: number
  imageHeight: number
  scale: number
  rotationRad: number
}

type GestureState =
  | { kind: 'drag'; pointerId: number; startPoint: DOMPoint; startTransform: ImageTransform }
  | { kind: 'pinch'; startDistance: number; startAngle: number; startCenter: DOMPoint; startTransform: ImageTransform }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

function dist(a: DOMPoint, b: DOMPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function ang(a: DOMPoint, b: DOMPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function mid(a: DOMPoint, b: DOMPoint): DOMPoint {
  return new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): DOMPoint {
  const point = new DOMPoint(clientX, clientY)
  const matrix = svg.getScreenCTM()
  if (!matrix) {
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    return new DOMPoint(
      ((clientX - rect.left) / rect.width) * vb.width,
      ((clientY - rect.top) / rect.height) * vb.height,
    )
  }
  return point.matrixTransform(matrix.inverse())
}

function readNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('画像を読み込めませんでした'))
    img.src = src
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') { resolve(reader.result); return }
      reject(new Error('画像データを読み込めませんでした'))
    }
    reader.onerror = () => reject(new Error('画像データを読み込めませんでした'))
    reader.readAsDataURL(file)
  })
}

export function KisekaePreview({ variant }: { variant: string }) {
  const clipId = useId().replace(/:/g, '')

  const [printAreaShape, setPrintAreaShape] = useState<SvgShapeResult | null>(null)
  const [bleedAreaShape, setBleedAreaShape] = useState<SvgShapeResult | null>(null)
  const [showBleedArea, setShowBleedArea] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null)
  const [baseImageSize, setBaseImageSize] = useState<{ width: number; height: number } | null>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [transform, setTransform] = useState<ImageTransform | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, DOMPoint>())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform | null>(null)

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  // Load print spec + base image size from commerce API
  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setLoadError(null)
      setPrintAreaShape(null)
      setBleedAreaShape(null)
      setBaseImageUrl(null)
      setBaseImageSize(null)
    })

    async function load() {
      try {
        const spec = await fetchPrintSpec(variant)
        if (cancelled) return

        const parts = await fetchAndParseGripCaseClip(spec.print_spec.print_area_svg_url)
        if (cancelled) return

        const remoteBaseImageUrl = spec.print_spec.base_image_url
        const usableBaseImageUrl = remoteBaseImageUrl
          ? await readNaturalSize(remoteBaseImageUrl).then(size => ({ url: remoteBaseImageUrl, size })).catch(() => null)
          : null
        if (cancelled) return

        setPrintAreaShape(parts.printArea)
        setBleedAreaShape(parts.bleedArea)
        setBaseImageUrl(usableBaseImageUrl?.url ?? null)
        setBaseImageSize(usableBaseImageUrl?.size ?? null)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'ロード失敗')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [variant])

  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    e.target.value = ''

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) { setFileError('PNG/JPEG の画像を選んでください。'); return }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) { setFileError('画像は10MB以下にしてください。'); return }

    try {
      const url = await readFileAsDataUrl(file)
      const size = await readNaturalSize(url)
      if (!printAreaShape) { setFileError('印刷エリアの読み込み後に選択してください。'); return }

      const canvas = baseImageSize ?? printAreaShape.viewBox
      const coverScale = Math.max(canvas.width / size.width, canvas.height / size.height)
      setImageUrl(url)
      setTransform({
        centerX: canvas.width / 2,
        centerY: canvas.height / 2,
        imageWidth: size.width * coverScale,
        imageHeight: size.height * coverScale,
        scale: 1,
        rotationRad: 0,
      })
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '画像を読み込めませんでした')
    }
  }, [baseImageSize, printAreaShape])

  const updateTransform = useCallback((updater: (t: ImageTransform) => ImageTransform) => {
    setTransform(prev => {
      if (!prev) return prev
      const next = updater(prev)
      transformRef.current = next
      return next
    })
  }, [])

  const onPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !transform) return
    event.preventDefault()
    svg.setPointerCapture(event.pointerId)
    const point = clientToSvg(svg, event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)
    const points = [...pointersRef.current.values()]
    if (points.length >= 2) {
      gestureRef.current = { kind: 'pinch', startDistance: dist(points[0], points[1]), startAngle: ang(points[0], points[1]), startCenter: mid(points[0], points[1]), startTransform: transform }
      return
    }
    gestureRef.current = { kind: 'drag', pointerId: event.pointerId, startPoint: point, startTransform: transform }
  }, [transform])

  const onPointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    const gesture = gestureRef.current
    if (!svg || !gesture || !pointersRef.current.has(event.pointerId)) return
    event.preventDefault()
    const point = clientToSvg(svg, event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)
    if (gesture.kind === 'drag') {
      if (gesture.pointerId !== event.pointerId) return
      updateTransform(() => ({ ...gesture.startTransform, centerX: gesture.startTransform.centerX + point.x - gesture.startPoint.x, centerY: gesture.startTransform.centerY + point.y - gesture.startPoint.y }))
      return
    }
    const points = [...pointersRef.current.values()]
    if (points.length < 2 || gesture.startDistance === 0) return
    const currentCenter = mid(points[0], points[1])
    const nextScale = clamp(gesture.startTransform.scale * (dist(points[0], points[1]) / gesture.startDistance), IMAGE_MIN_SCALE, IMAGE_MAX_SCALE)
    updateTransform(() => ({ ...gesture.startTransform, centerX: gesture.startTransform.centerX + currentCenter.x - gesture.startCenter.x, centerY: gesture.startTransform.centerY + currentCenter.y - gesture.startCenter.y, scale: nextScale, rotationRad: gesture.startTransform.rotationRad + ang(points[0], points[1]) - gesture.startAngle }))
  }, [updateTransform])

  const onPointerEnd = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    pointersRef.current.delete(event.pointerId)
    const points = [...pointersRef.current.entries()]
    const cur = transformRef.current
    if (points.length === 1 && cur) {
      const [pid, pt] = points[0]
      gestureRef.current = { kind: 'drag', pointerId: pid, startPoint: pt, startTransform: cur }
      return
    }
    gestureRef.current = null
  }, [])

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !transform) return
    const point = clientToSvg(svg, event.clientX, event.clientY)
    const factor = Math.exp(-event.deltaY * 0.001)
    updateTransform(t => {
      const nextScale = clamp(t.scale * factor, IMAGE_MIN_SCALE, IMAGE_MAX_SCALE)
      const ratio = nextScale / t.scale
      return { ...t, centerX: point.x - (point.x - t.centerX) * ratio, centerY: point.y - (point.y - t.centerY) * ratio, scale: nextScale }
    })
  }, [transform, updateTransform])

  const clipSize = printAreaShape?.viewBox
  const canvasSize = clipSize ? (baseImageSize ?? clipSize) : null
  const viewBoxAttr = canvasSize ? `0 0 ${canvasSize.width} ${canvasSize.height}` : undefined

  // Scale guide overlays if base image is larger than clip viewBox
  const guideScale = (canvasSize && clipSize && (canvasSize.width !== clipSize.width || canvasSize.height !== clipSize.height))
    ? Math.min(canvasSize.width / clipSize.width, canvasSize.height / clipSize.height)
    : 1
  const guideOffsetX = (canvasSize && clipSize) ? (canvasSize.width - clipSize.width * guideScale) / 2 : 0
  const guideOffsetY = (canvasSize && clipSize) ? (canvasSize.height - clipSize.height * guideScale) / 2 : 0
  const guideTransform = guideScale !== 1 ? `translate(${guideOffsetX} ${guideOffsetY}) scale(${guideScale})` : undefined

  const transformAttr = transform
    ? `translate(${transform.centerX} ${transform.centerY}) rotate(${radToDeg(transform.rotationRad)}) scale(${transform.scale})`
    : undefined

  if (loading) return <p style={{ padding: 24 }}>Loading...</p>
  if (loadError) return <p style={{ padding: 24, color: 'red' }}>Error: {loadError}</p>
  if (!printAreaShape || !canvasSize || !viewBoxAttr) return <p style={{ padding: 24, color: 'red' }}>印刷仕様の取得に失敗しました</p>

  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 16, marginBottom: 12 }}>着せ替えプレビュー: {variant}</h1>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ padding: '6px 14px', background: '#4f46e5', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
          <input type="file" accept="image/png,image/jpeg" onChange={onFile} style={{ display: 'none' }} />
          画像を選ぶ
        </label>
        {bleedAreaShape && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={showBleedArea} onChange={e => setShowBleedArea(e.target.checked)} />
            塗りたし (bleed_area)
          </label>
        )}
      </div>
      {fileError && <p style={{ color: 'red', fontSize: 13 }}>{fileError}</p>}

      <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#f7f8fa' }}>
        <svg
          ref={svgRef}
          viewBox={viewBoxAttr}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', width: '100%', maxHeight: '80vh', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          <style>{`
            .kisekae__clip-shape * { fill: #000 !important; stroke: none !important; }
            .kisekae__part--print * {
              fill: none !important;
              stroke: rgba(0,153,255,0.7) !important;
              stroke-width: 1 !important;
              vector-effect: non-scaling-stroke;
            }
            .kisekae__part--bleed * {
              fill: none !important;
              stroke: rgba(0,180,70,0.6) !important;
              stroke-width: 1.25 !important;
              stroke-dasharray: 8 4 !important;
              vector-effect: non-scaling-stroke;
            }
          `}</style>

          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <g transform={guideTransform} dangerouslySetInnerHTML={{ __html: printAreaShape.clipMarkup }} />
            </clipPath>
          </defs>

          {/* base image — full canvas (skipped if commerce did not return base_image_url) */}
          {baseImageUrl && (
            <image
              href={baseImageUrl}
              x="0" y="0"
              width={canvasSize.width}
              height={canvasSize.height}
              preserveAspectRatio="none"
            />
          )}

          {/* user design clipped to print_area */}
          {imageUrl && transform && transformAttr && (
            <g clipPath={`url(#${clipId})`}>
              <g transform={transformAttr}>
                <image
                  href={imageUrl}
                  x={-transform.imageWidth / 2}
                  y={-transform.imageHeight / 2}
                  width={transform.imageWidth}
                  height={transform.imageHeight}
                  preserveAspectRatio="none"
                />
              </g>
            </g>
          )}

          {/* bleed_area guide overlay */}
          {showBleedArea && bleedAreaShape && (
            <g className="kisekae__part--bleed">
              <g transform={guideTransform} dangerouslySetInnerHTML={{ __html: bleedAreaShape.markup }} />
            </g>
          )}

          {/* print_area outline on top */}
          <g className="kisekae__part--print">
            <g transform={guideTransform} dangerouslySetInnerHTML={{ __html: printAreaShape.markup }} />
          </g>
        </svg>
      </div>

      <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
        ドラッグ: 移動 / ピンチ / ホイール: 拡縮 / 2本指: 回転
      </p>
    </section>
  )
}
