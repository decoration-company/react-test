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
import {
  fetchAndParseGripCaseClip,
  fetchAndParseSvgPath,
  svgPathToShape,
  type SvgShapeResult,
} from './parseSvgPath'

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

function deriveBaseImageUrl(printAreaSvgUrl: string): string | null {
  if (printAreaSvgUrl.endsWith('_clip.svg')) {
    return printAreaSvgUrl.slice(0, -'_clip.svg'.length) + '_base.png'
  }
  if (printAreaSvgUrl.endsWith('/clip.svg')) {
    return printAreaSvgUrl.slice(0, -'clip.svg'.length) + 'base.png'
  }
  return null
}

function sameViewBox(a: SvgShapeResult, b: SvgShapeResult | null): boolean {
  if (!b) return true
  return a.viewBox.width === b.viewBox.width && a.viewBox.height === b.viewBox.height
}

export function VerifyPreview({ variant }: { variant: string }) {
  const clipId = useId().replace(/:/g, '')

  const [spec, setSpec] = useState<PrintSpec | null>(null)
  const [specError, setSpecError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [printAreaShape, setPrintAreaShape] = useState<SvgShapeResult | null>(null)
  const [printAreaError, setPrintAreaError] = useState<string | null>(null)
  const [safeAreaShape, setSafeAreaShape] = useState<SvgShapeResult | null>(null)
  const [bleedAreaShape, setBleedAreaShape] = useState<SvgShapeResult | null>(null)
  const [showSafeArea, setShowSafeArea] = useState(true)
  const [showBleedArea, setShowBleedArea] = useState(true)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [transform, setTransform] = useState<ImageTransform | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [loadedBaseImage, setLoadedBaseImage] = useState<{ url: string; size: PreviewSize } | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, DOMPoint>())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform | null>(null)
  const activeBaseImageUrl = spec
    ? spec.print_spec.base_image_url ?? deriveBaseImageUrl(spec.print_spec.print_area_svg_url)
    : null
  const baseImageSize = loadedBaseImage?.url === activeBaseImageUrl ? loadedBaseImage.size : null

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
      setPrintAreaShape(null)
      setSafeAreaShape(null)
      setBleedAreaShape(null)

      try {
        const data = await fetchPrintSpec(variant)
        if (cancelled) return
        setSpec(data)

        try {
          const parts = await fetchAndParseGripCaseClip(data.print_spec.print_area_svg_url)
          if (!cancelled) {
            setPrintAreaShape(parts.printArea)
            setSafeAreaShape(parts.safeArea)
            setBleedAreaShape(parts.bleedArea)
          }
        } catch (e) {
          try {
            const pa = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.print_area_svg_url))
            if (!cancelled) setPrintAreaShape(pa)

            if (data.print_spec.safe_area_svg_url) {
              try {
                const sa = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.safe_area_svg_url))
                if (!cancelled) setSafeAreaShape(sa)
              } catch { /* ignore */ }
            }
            if (data.print_spec.bleed_area_svg_url) {
              try {
                const ba = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.bleed_area_svg_url))
                if (!cancelled) setBleedAreaShape(ba)
              } catch { /* ignore */ }
            }
          } catch {
            if (!cancelled) setPrintAreaError(e instanceof Error ? e.message : 'SVG 解析失敗')
          }
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
    const baseImageUrl = activeBaseImageUrl
    if (!baseImageUrl) return

    readNaturalSize(baseImageUrl)
      .then(size => {
        if (!cancelled) setLoadedBaseImage({ url: baseImageUrl, size })
      })
      .catch(() => {
        if (!cancelled) setLoadedBaseImage(null)
      })

    return () => { cancelled = true }
  }, [activeBaseImageUrl])

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
      if (!printAreaShape) return

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
      URL.revokeObjectURL(url)
      setFileError(err instanceof Error ? err.message : '画像を読み込めませんでした')
    }
  }, [baseImageSize, imageUrl, printAreaShape])

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

  const baseImageUrl = activeBaseImageUrl
  const clipSize = printAreaShape?.viewBox
  const canvasSize = clipSize ? (baseImageSize ?? clipSize) : null
  const viewBoxAttr = canvasSize ? `0 0 ${canvasSize.width} ${canvasSize.height}` : undefined
  const needsLegacyGuideTransform = Boolean(
    baseImageSize && clipSize && (baseImageSize.width !== clipSize.width || baseImageSize.height !== clipSize.height),
  )
  const guideScale = needsLegacyGuideTransform && canvasSize && clipSize
    ? Math.min(canvasSize.width / clipSize.width, canvasSize.height / clipSize.height)
    : 1
  const guideOffsetX = needsLegacyGuideTransform && canvasSize && clipSize
    ? (canvasSize.width - clipSize.width * guideScale) / 2
    : 0
  const guideOffsetY = needsLegacyGuideTransform && canvasSize && clipSize
    ? (canvasSize.height - clipSize.height * guideScale) / 2
    : 0
  const guideTransform = needsLegacyGuideTransform
    ? `translate(${guideOffsetX} ${guideOffsetY}) scale(${guideScale})`
    : undefined

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
        clipViewBoxWidth: clipSize ? Math.round(clipSize.width * 100) / 100 : null,
        clipViewBoxHeight: clipSize ? Math.round(clipSize.height * 100) / 100 : null,
        guideScale: needsLegacyGuideTransform ? Math.round(guideScale * 1000) / 1000 : 1,
        baseImageUrl,
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
        {safeAreaShape && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showSafeArea} onChange={e => setShowSafeArea(e.target.checked)} />
            Safe Area
          </label>
        )}
        {bleedAreaShape && (
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
      {printAreaShape && canvasSize && viewBoxAttr && (
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
            <style>
              {`
                .verify-preview__part--paper * {
                  fill: #fff !important;
                  stroke: #d1d5db !important;
                  stroke-width: 1 !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__clip-shape * {
                  fill: #000 !important;
                  stroke: none !important;
                }
                .verify-preview__part--print * {
                  fill: none !important;
                  stroke: rgba(0, 153, 255, 0.72) !important;
                  stroke-width: 2 !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--safe * {
                  fill: none !important;
                  stroke: rgba(255, 0, 0, 0.58) !important;
                  stroke-width: 3 !important;
                  stroke-dasharray: 8 4 !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--bleed * {
                  fill: none !important;
                  stroke: rgba(0, 180, 70, 0.58) !important;
                  stroke-width: 3 !important;
                  stroke-dasharray: 8 4 !important;
                  vector-effect: non-scaling-stroke;
                }
              `}
            </style>
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <g
                  className="verify-preview__clip-shape"
                  transform={guideTransform}
                  dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
                />
              </clipPath>
            </defs>

            {/* White background in print area shape */}
            <g className="verify-preview__part--paper">
              <g
                transform={guideTransform}
                dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
              />
            </g>

            {/* Base image */}
            {baseImageUrl && (
              <image
                href={baseImageUrl}
                x="0"
                y="0"
                width={canvasSize.width}
                height={canvasSize.height}
                preserveAspectRatio="none"
              />
            )}

            {!sameViewBox(printAreaShape, safeAreaShape) || !sameViewBox(printAreaShape, bleedAreaShape) ? (
              <text x="12" y="24" fill="#b45309" fontSize="14">
                guide viewBox mismatch
              </text>
            ) : null}

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
            {showSafeArea && safeAreaShape && (
              <g className="verify-preview__part--safe">
                <g
                  transform={guideTransform}
                  dangerouslySetInnerHTML={{ __html: safeAreaShape.markup }}
                />
              </g>
            )}

            {/* Bleed area overlay */}
            {showBleedArea && bleedAreaShape && (
              <g className="verify-preview__part--bleed">
                <g
                  transform={guideTransform}
                  dangerouslySetInnerHTML={{ __html: bleedAreaShape.markup }}
                />
              </g>
            )}

            {/* Print area outline (on top) */}
            <g className="verify-preview__part--print">
              <g
                transform={guideTransform}
                dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
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
