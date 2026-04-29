import {
  type ChangeEvent,
  type PointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  PIXEL_9A_CASE_CLIP_PATH_BOUNDS,
  PIXEL_9A_CASE_CLIP_PATH_D,
} from './constants'
import {
  clampImageScale,
  clientPointToSvgPoint,
  createCoverTransform,
  createImageItemId,
  createRenderPayload,
  type Pixel9aEditorImageItem,
  type Pixel9aEditorImageTransform,
} from './transform'
import './Pixel9aCaseMaskPreview.css'

const PLACEHOLDER_DATA_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="860" viewBox="0 0 400 860">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#c4b5fd"/>
        <stop offset="50%" style="stop-color:#93c5fd"/>
        <stop offset="100%" style="stop-color:#fcd34d"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="48%" text-anchor="middle" fill="#1f2937" font-family="system-ui,sans-serif" font-size="22">Pixel 9a</text>
    <text x="50%" y="54%" text-anchor="middle" fill="#374151" font-family="system-ui,sans-serif" font-size="14">プレースホルダー</text>
  </svg>`)

const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

function viewBoxAttr(): string {
  const b = PIXEL_9A_CASE_CLIP_PATH_BOUNDS
  return `${b.left} ${b.top} ${b.width} ${b.height}`
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function distance(a: DOMPoint, b: DOMPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function angle(a: DOMPoint, b: DOMPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function midpoint(a: DOMPoint, b: DOMPoint): DOMPoint {
  return new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
}

function createPlaceholderItem(): Pixel9aEditorImageItem {
  return {
    id: createImageItemId(),
    sourceImageUrl: PLACEHOLDER_DATA_URL,
    naturalWidth: 400,
    naturalHeight: 860,
    transform: createCoverTransform(400, 860),
  }
}

function readImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('画像サイズを読み取れませんでした'))
    image.src = src
  })
}

type GestureState =
  | {
      kind: 'drag'
      pointerId: number
      startPoint: DOMPoint
      startTransform: Pixel9aEditorImageTransform
    }
  | {
      kind: 'pinch'
      startDistance: number
      startAngle: number
      startCenter: DOMPoint
      startTransform: Pixel9aEditorImageTransform
    }

type MockSaveResult = {
  design_id: string
  composed_image_url: string
  preview_image_url: string
}

function mockSaveDesign(sourceImageUrl: string): Promise<MockSaveResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const designId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `mock-${Date.now().toString(36)}`

      resolve({
        design_id: designId,
        composed_image_url: sourceImageUrl,
        preview_image_url: sourceImageUrl,
      })
    }, 500)
  })
}

export function Pixel9aCaseMaskPreview() {
  const clipId = useId().replace(/:/g, '')
  const shadowId = `${clipId}-shadow`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, DOMPoint>())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<Pixel9aEditorImageTransform | null>(null)
  const [imageItem, setImageItem] = useState<Pixel9aEditorImageItem | null>(() => createPlaceholderItem())
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<MockSaveResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  useEffect(() => {
    transformRef.current = imageItem?.transform ?? null
  }, [imageItem?.transform])

  const updateTransform = useCallback((updater: (transform: Pixel9aEditorImageTransform) => Pixel9aEditorImageTransform) => {
    setImageItem((current) => {
      if (!current) return current
      const nextTransform = updater(current.transform)
      transformRef.current = nextTransform
      return { ...current, transform: nextTransform }
    })
  }, [])

  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileError(null)
    e.target.value = ''

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setFileError('PNG/JPEG/JPG の画像を選んでください。')
      return
    }

    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      setFileError('画像サイズは10MB以下にしてください。')
      return
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl)
    const next = URL.createObjectURL(file)

    try {
      const naturalSize = await readImageNaturalSize(next)
      setObjectUrl(next)
      setImageItem({
        id: createImageItemId(),
        sourceImageUrl: next,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        transform: createCoverTransform(naturalSize.width, naturalSize.height),
      })
    } catch (error) {
      URL.revokeObjectURL(next)
      setFileError(error instanceof Error ? error.message : '画像サイズを読み取れませんでした。')
    }
  }, [objectUrl])

  const resetPlaceholder = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    setFileError(null)
    setImageItem(createPlaceholderItem())
  }, [objectUrl])

  const showBlankCase = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    setFileError(null)
    setImageItem(null)
  }, [objectUrl])

  const rotateBy = useCallback((deltaRad: number) => {
    updateTransform((transform) => ({
      ...transform,
      rotationRad: transform.rotationRad + deltaRad,
    }))
  }, [updateTransform])

  const onMockSave = useCallback(async () => {
    if (!imageItem) {
      setSaveError('保存する画像を選んでください。')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveResult(null)

    try {
      const result = await mockSaveDesign(imageItem.sourceImageUrl)
      setSaveResult(result)
    } catch {
      setSaveError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }, [imageItem])

  const onPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !imageItem) return

    event.preventDefault()
    svg.setPointerCapture(event.pointerId)

    const point = clientPointToSvgPoint(svg, event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)

    const points = [...pointersRef.current.values()]
    if (points.length >= 2) {
      const [first, second] = points
      gestureRef.current = {
        kind: 'pinch',
        startDistance: distance(first, second),
        startAngle: angle(first, second),
        startCenter: midpoint(first, second),
        startTransform: imageItem.transform,
      }
      return
    }

    gestureRef.current = {
      kind: 'drag',
      pointerId: event.pointerId,
      startPoint: point,
      startTransform: imageItem.transform,
    }
  }, [imageItem])

  const onPointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    const gesture = gestureRef.current
    if (!svg || !gesture || !pointersRef.current.has(event.pointerId)) return

    event.preventDefault()
    const point = clientPointToSvgPoint(svg, event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, point)

    if (gesture.kind === 'drag') {
      if (gesture.pointerId !== event.pointerId) return
      updateTransform((current) => ({
        ...current,
        centerX: gesture.startTransform.centerX + point.x - gesture.startPoint.x,
        centerY: gesture.startTransform.centerY + point.y - gesture.startPoint.y,
      }))
      return
    }

    const points = [...pointersRef.current.values()]
    if (points.length < 2 || gesture.startDistance === 0) return

    const [first, second] = points
    const currentCenter = midpoint(first, second)
    const nextScale = clampImageScale(gesture.startTransform.scale * (distance(first, second) / gesture.startDistance))

    updateTransform((current) => ({
      ...current,
      centerX: gesture.startTransform.centerX + currentCenter.x - gesture.startCenter.x,
      centerY: gesture.startTransform.centerY + currentCenter.y - gesture.startCenter.y,
      scale: nextScale,
      rotationRad: gesture.startTransform.rotationRad + angle(first, second) - gesture.startAngle,
    }))
  }, [updateTransform])

  const onPointerEnd = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId)
    }

    pointersRef.current.delete(event.pointerId)
    const points = [...pointersRef.current.entries()]
    const currentTransform = transformRef.current

    if (points.length === 1 && currentTransform) {
      const [pointerId, point] = points[0]
      gestureRef.current = {
        kind: 'drag',
        pointerId,
        startPoint: point,
        startTransform: currentTransform,
      }
      return
    }

    gestureRef.current = null
  }, [])

  const onWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !imageItem) return

    event.preventDefault()
    const point = clientPointToSvgPoint(svg, event.clientX, event.clientY)
    const factor = Math.exp(-event.deltaY * 0.001)

    updateTransform((transform) => {
      const nextScale = clampImageScale(transform.scale * factor)
      const scaleRatio = nextScale / transform.scale

      return {
        ...transform,
        centerX: point.x - (point.x - transform.centerX) * scaleRatio,
        centerY: point.y - (point.y - transform.centerY) * scaleRatio,
        scale: nextScale,
      }
    })
  }, [imageItem, updateTransform])

  const b = PIXEL_9A_CASE_CLIP_PATH_BOUNDS
  const imageTransform = imageItem?.transform
  const debugPayload = useMemo(() => imageItem ? createRenderPayload(imageItem) : null, [imageItem])
  const imageTransformAttr = imageTransform
    ? `translate(${imageTransform.centerX} ${imageTransform.centerY}) rotate(${radiansToDegrees(imageTransform.rotationRad)}) scale(${imageTransform.scale})`
    : undefined

  return (
    <section className="pixel9a-case-mask" aria-label="Pixel 9a ケースマスクプレビュー">
      <h1 className="pixel9a-case-mask__title">Pixel 9a（SVG マスク）</h1>
      <div className="pixel9a-case-mask__controls">
        <label className="pixel9a-case-mask__file">
          <input className="pixel9a-case-mask__file-input" type="file" accept="image/png,image/jpeg" onChange={onFile} />
          画像を選ぶ
        </label>
        <button type="button" className="pixel9a-case-mask__reset" onClick={showBlankCase}>
          無地（白）で見る
        </button>
        <button type="button" className="pixel9a-case-mask__reset" onClick={resetPlaceholder}>
          仮画像に戻す
        </button>
        <button type="button" className="pixel9a-case-mask__reset" onClick={() => rotateBy(-Math.PI / 12)} disabled={!imageItem}>
          左回転
        </button>
        <button type="button" className="pixel9a-case-mask__reset" onClick={() => rotateBy(Math.PI / 12)} disabled={!imageItem}>
          右回転
        </button>
        <button type="button" className="pixel9a-case-mask__save" onClick={onMockSave} disabled={!imageItem || isSaving}>
          {isSaving ? '保存中' : '保存'}
        </button>
      </div>
      {fileError ? <p className="pixel9a-case-mask__error">{fileError}</p> : null}
      {saveError ? <p className="pixel9a-case-mask__error">{saveError}</p> : null}
      {saveResult ? (
        <output className="pixel9a-case-mask__save-result">
          design_id: {saveResult.design_id}
        </output>
      ) : null}
      <div className="pixel9a-case-mask__stage">
        <svg
          ref={svgRef}
          className="pixel9a-case-mask__svg"
          viewBox={viewBoxAttr()}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="ケース形状でクリップされた画像"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse" clipRule="evenodd">
              <path d={PIXEL_9A_CASE_CLIP_PATH_D} fillRule="evenodd" />
            </clipPath>
            <filter
              id={shadowId}
              x={b.left - 48}
              y={b.top - 48}
              width={b.width + 96}
              height={b.height + 112}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feDropShadow
                in="SourceAlpha"
                dx="0"
                dy="4"
                stdDeviation="10"
                floodColor="#000000"
                floodOpacity="0.10"
                result="ambient"
              />
              <feDropShadow
                in="SourceAlpha"
                dx="0"
                dy="10"
                stdDeviation="14"
                floodColor="#000000"
                floodOpacity="0.08"
                result="drop"
              />
              <feMerge>
                <feMergeNode in="ambient" />
                <feMergeNode in="drop" />
              </feMerge>
            </filter>
          </defs>
          <path d={PIXEL_9A_CASE_CLIP_PATH_D} fill="#000000" fillRule="evenodd" filter={`url(#${shadowId})`} />
          <path d={PIXEL_9A_CASE_CLIP_PATH_D} fill="#ffffff" fillRule="evenodd" />
          {imageItem && imageTransform && imageTransformAttr ? (
            <g clipPath={`url(#${clipId})`}>
              <g transform={imageTransformAttr}>
                <image
                  href={imageItem.sourceImageUrl}
                  x={-imageTransform.imageWidth / 2}
                  y={-imageTransform.imageHeight / 2}
                  width={imageTransform.imageWidth}
                  height={imageTransform.imageHeight}
                  preserveAspectRatio="none"
                />
              </g>
            </g>
          ) : null}
        </svg>
      </div>
      <details className="pixel9a-case-mask__debug">
        <summary>payload</summary>
        <pre>{JSON.stringify(debugPayload, null, 2)}</pre>
      </details>
    </section>
  )
}
