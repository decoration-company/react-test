import {
  type ChangeEvent,
  type PointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { fetchPrintSpec, type PrintSpec } from './fetchPrintSpec'
import { fetchAndParseSvgPath, type SvgPathResult } from './parseSvgPath'

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

type PreviewSize = {
  width: number
  height: number
}

type GestureState =
  | {
      kind: 'drag'
      pointerId: number
      startPoint: DOMPoint
      startTransform: ImageTransform
    }
  | {
      kind: 'pinch'
      startDistance: number
      startAngle: number
      startCenter: DOMPoint
      startTransform: ImageTransform
    }

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

export function VerifyPreview({ variant }: { variant: string }) {
  const clipId = useId().replace(/:/g, '')

  const [spec, setSpec] = useState<PrintSpec | null>(null)
  const [specError, setSpecError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [printAreaPath, setPrintAreaPath] = useState<SvgPathResult | null>(null)
  const [printAreaError, setPrintAreaError] = useState<string | null>(null)
  const [safeAreaPath, setSafeAreaPath] = useState<SvgPathResult | null>(null)
  const [bleedAreaPath, setBleedAreaPath] = useState<SvgPathResult | null>(null)
  const [showSafeArea, setShowSafeArea] = useState(true)
  const [showBleedArea, setShowBleedArea] = useState(true)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [transform, setTransform] = useState<ImageTransform | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [baseImageSize, setBaseImageSize] = useState<PreviewSize | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, DOMPoint>())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform | null>(null)

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  // Fetch spec + SVGs
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setSpecError(null)
      setPrintAreaError(null)

      try {
        const data = await fetchPrintSpec(variant)
        if (cancelled) return
        setSpec(data)

        // Fetch print_area SVG (required)
        try {
          const pa = await fetchAndParseSvgPath(data.print_spec.print_area_svg_url)
          if (!cancelled) setPrintAreaPath(pa)
        } catch (e) {
          if (!cancelled) setPrintAreaError(e instanceof Error ? e.message : 'SVG 解析失敗')
        }

        // Fetch optional SVGs
        if (data.print_spec.safe_area_svg_url) {
          try {
            const sa = await fetchAndParseSvgPath(data.print_spec.safe_area_svg_url)
            if (!cancelled) setSafeAreaPath(sa)
          } catch { /* ignore */ }
        }
        if (data.print_spec.bleed_area_svg_url) {
          try {
            const ba = await fetchAndParseSvgPath(data.print_spec.bleed_area_svg_url)
            if (!cancelled) setBleedAreaPath(ba)
          } catch { /* ignore */ }
        }
      } catch (e) {
        if (!cancelled) setSpecError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [variant])

  useEffect(() => {
    let cancelled = false
    const baseImageUrl = spec?.print_spec.base_image_url
    setBaseImageSize(null)
    if (!baseImageUrl) return

    readNaturalSize(baseImageUrl)
      .then(size => {
        if (!cancelled) setBaseImageSize(size)
      })
      .catch(() => {
        if (!cancelled) setBaseImageSize(null)
      })

    return () => { cancelled = true }
  }, [spec?.print_spec.base_image_url])

  // Image file handling
  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    e.target.value = ''

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setFileError('PNG/JPEG の画像を選んでください。')
      return
    }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      setFileError('画像サイズは10MB以下にしてください。')
      return
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl)
    const url = URL.createObjectURL(file)

    try {
      const size = await readNaturalSize(url)
      if (!printAreaPath) return

      const canvas = baseImageSize ?? printAreaPath.viewBox
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
      URL.revokeObjectURL(url)
      setFileError(err instanceof Error ? err.message : '画像を読み込めませんでした')
    }
  }, [baseImageSize, imageUrl, printAreaPath])

  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }
  }, [imageUrl])

  const updateTransform = useCallback((updater: (t: ImageTransform) => ImageTransform) => {
    setTransform(prev => {
      if (!prev) return prev
      const next = updater(prev)
      transformRef.current = next
      return next
    })
  }, [])

  // Gesture handlers
  const onPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !transform) return
    event.preventDefault()
    svg.setPointerCapture(event.pointerId)

    const point = clientToSvg(svg, event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)

    const points = [...pointersRef.current.values()]
    if (points.length >= 2) {
      gestureRef.current = {
        kind: 'pinch',
        startDistance: dist(points[0], points[1]),
        startAngle: ang(points[0], points[1]),
        startCenter: mid(points[0], points[1]),
        startTransform: transform,
      }
      return
    }

    gestureRef.current = {
      kind: 'drag',
      pointerId: event.pointerId,
      startPoint: point,
      startTransform: transform,
    }
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
      updateTransform(() => ({
        ...gesture.startTransform,
        centerX: gesture.startTransform.centerX + point.x - gesture.startPoint.x,
        centerY: gesture.startTransform.centerY + point.y - gesture.startPoint.y,
      }))
      return
    }

    const points = [...pointersRef.current.values()]
    if (points.length < 2 || gesture.startDistance === 0) return
    const currentCenter = mid(points[0], points[1])
    const nextScale = clamp(
      gesture.startTransform.scale * (dist(points[0], points[1]) / gesture.startDistance),
      IMAGE_MIN_SCALE,
      IMAGE_MAX_SCALE,
    )
    updateTransform(() => ({
      ...gesture.startTransform,
      centerX: gesture.startTransform.centerX + currentCenter.x - gesture.startCenter.x,
      centerY: gesture.startTransform.centerY + currentCenter.y - gesture.startCenter.y,
      scale: nextScale,
      rotationRad: gesture.startTransform.rotationRad + ang(points[0], points[1]) - gesture.startAngle,
    }))
  }, [updateTransform])

  const onPointerEnd = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId)
    }
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

  const onWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !transform) return
    event.preventDefault()
    const point = clientToSvg(svg, event.clientX, event.clientY)
    const factor = Math.exp(-event.deltaY * 0.001)

    updateTransform(t => {
      const nextScale = clamp(t.scale * factor, IMAGE_MIN_SCALE, IMAGE_MAX_SCALE)
      const ratio = nextScale / t.scale
      return {
        ...t,
        centerX: point.x - (point.x - t.centerX) * ratio,
        centerY: point.y - (point.y - t.centerY) * ratio,
        scale: nextScale,
      }
    })
  }, [transform, updateTransform])

  // Loading
  if (loading) return <p>Loading...</p>
  if (specError) return <p style={{ color: 'red' }}>Error: {specError}</p>
  if (!spec) return <p style={{ color: 'red' }}>spec not loaded</p>

  const svgPathSize = printAreaPath?.viewBox
  const canvasSize = svgPathSize ? (baseImageSize ?? svgPathSize) : null
  const viewBoxAttr = canvasSize ? `0 0 ${canvasSize.width} ${canvasSize.height}` : undefined
  // 暫定対応：base image と SVG の座標系統一は将来再検討。
  // 現在は余白込み base image をキャンバスにし、SVG viewBox を中央寄せ + contain で重ねる。
  const guideScale = canvasSize && svgPathSize
    ? Math.min(canvasSize.width / svgPathSize.width, canvasSize.height / svgPathSize.height)
    : 1
  const guideOffsetX = canvasSize && svgPathSize
    ? (canvasSize.width - svgPathSize.width * guideScale) / 2
    : 0
  const guideOffsetY = canvasSize && svgPathSize
    ? (canvasSize.height - svgPathSize.height * guideScale) / 2
    : 0
  const guideTransform = `translate(${guideOffsetX} ${guideOffsetY}) scale(${guideScale})`

  const transformAttr = transform
    ? `translate(${transform.centerX} ${transform.centerY}) rotate(${radToDeg(transform.rotationRad)}) scale(${transform.scale})`
    : undefined

  const placementInfo = transform
    ? {
        variant,
        centerX: Math.round(transform.centerX * 100) / 100,
        centerY: Math.round(transform.centerY * 100) / 100,
        scale: Math.round(transform.scale * 1000) / 1000,
        rotationDeg: Math.round(radToDeg(transform.rotationRad) * 100) / 100,
        imageWidth: Math.round(transform.imageWidth * 100) / 100,
        imageHeight: Math.round(transform.imageHeight * 100) / 100,
        canvasWidth: canvasSize ? Math.round(canvasSize.width * 100) / 100 : null,
        canvasHeight: canvasSize ? Math.round(canvasSize.height * 100) / 100 : null,
        guideScale: Math.round(guideScale * 1000) / 1000,
      }
    : null

  return (
    <section style={{ maxWidth: 800, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18 }}>Verify: {spec.device.name} {spec.product_type.name}</h1>

      {/* Spec JSON */}
      <details open>
        <summary>Print Spec (JSON)</summary>
        <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
          {JSON.stringify(spec, null, 2)}
        </pre>
      </details>

      {/* Controls */}
      <div style={{ margin: '12px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ padding: '6px 12px', background: '#4f46e5', color: '#fff', borderRadius: 4, cursor: 'pointer' }}>
          <input type="file" accept="image/png,image/jpeg" onChange={onFile} style={{ display: 'none' }} />
          画像を選ぶ
        </label>
        {safeAreaPath && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showSafeArea} onChange={e => setShowSafeArea(e.target.checked)} />
            Safe Area
          </label>
        )}
        {bleedAreaPath && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showBleedArea} onChange={e => setShowBleedArea(e.target.checked)} />
            Bleed Area
          </label>
        )}
      </div>
      {fileError && <p style={{ color: 'red' }}>{fileError}</p>}

      {/* SVG errors */}
      {printAreaError && <p style={{ color: 'red' }}>Print Area SVG: {printAreaError}</p>}

      {/* SVG Preview */}
      {printAreaPath && canvasSize && viewBoxAttr && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#f7f8fa' }}>
          <svg
            ref={svgRef}
            viewBox={viewBoxAttr}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block', width: '100%', maxHeight: '70vh', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onWheel={onWheel}
          >
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <g transform={guideTransform}>
                  <path
                    d={printAreaPath.d}
                    fillRule={printAreaPath.fillRule}
                    clipRule={printAreaPath.fillRule}
                  />
                </g>
              </clipPath>
            </defs>

            {/* White background in print area shape */}
            <g transform={guideTransform}>
              <path
                d={printAreaPath.d}
                fill="#ffffff"
                fillRule={printAreaPath.fillRule}
                stroke="#ccc"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {/* Base image */}
            {spec.print_spec.base_image_url && (
              <image
                href={spec.print_spec.base_image_url}
                x="0"
                y="0"
                width={canvasSize.width}
                height={canvasSize.height}
                preserveAspectRatio="none"
              />
            )}

            {/* User image clipped to print area */}
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

            {/* Safe area overlay */}
            {showSafeArea && safeAreaPath && (
              <g transform={guideTransform}>
                <path
                  d={safeAreaPath.d}
                  fill="none"
                  fillRule={safeAreaPath.fillRule}
                  stroke="rgba(255,0,0,0.5)"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}

            {/* Bleed area overlay */}
            {showBleedArea && bleedAreaPath && (
              <g transform={guideTransform}>
                <path
                  d={bleedAreaPath.d}
                  fill="none"
                  fillRule={bleedAreaPath.fillRule}
                  stroke="rgba(0,200,0,0.5)"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}

            {/* Print area outline (on top) */}
            <g transform={guideTransform}>
              <path
                d={printAreaPath.d}
                fill="none"
                fillRule={printAreaPath.fillRule}
                stroke="rgba(0,153,255,0.7)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
        </div>
      )}

      {/* Placement info JSON */}
      <details open style={{ marginTop: 12 }}>
        <summary>Placement Info (JSON)</summary>
        <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
          {JSON.stringify(placementInfo, null, 2)}
        </pre>
      </details>
    </section>
  )
}
