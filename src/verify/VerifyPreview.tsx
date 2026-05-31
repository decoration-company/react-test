import {
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { fetchPrintSpec, type PrintSpec } from './fetchPrintSpec'
import {
  fetchAndParseDiaryCaseClip,
  fetchAndParseGripCaseClip,
  fetchAndParseSvgPath,
  svgPathToShape,
  type DiaryGuideLayer,
  type DiaryPrintMask,
  type SvgShapeResult,
} from './parseSvgPath'

const IMAGE_MIN_SCALE = 0.1
const IMAGE_MAX_SCALE = 4
const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])
const LOG_PREFIX = '[verify-preview]'

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

function logDebug(message: string, data?: unknown): void {
  console.info(`${LOG_PREFIX} ${message}`, data ?? '')
}

function logWarn(message: string, data?: unknown): void {
  console.warn(`${LOG_PREFIX} ${message}`, data ?? '')
}

function logError(message: string, data?: unknown): void {
  console.error(`${LOG_PREFIX} ${message}`, data ?? '')
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
  const isRemote = src.startsWith('http://') || src.startsWith('https://')

  const tryLoad = (useCrossOrigin: boolean): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      if (isRemote && useCrossOrigin) {
        img.crossOrigin = 'anonymous'
      }
      img.onload = () => {
        logDebug('readNaturalSize:onload', {
          src: summarizeImageUrl(src),
          useCrossOrigin,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        })
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
          reject(new Error('画像のサイズを取得できませんでした'))
          return
        }
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        logError('readNaturalSize:onerror', { src: summarizeImageUrl(src), useCrossOrigin })
        reject(new Error('画像を読み込めませんでした'))
      }
      img.src = src
    })

  if (!isRemote) {
    return tryLoad(false)
  }

  return tryLoad(true).catch(() => tryLoad(false))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('画像データを読み込めませんでした'))
    }
    reader.onerror = () => reject(new Error('画像データを読み込めませんでした'))
    reader.readAsDataURL(file)
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

function summarizeShape(shape: SvgShapeResult | null): Record<string, unknown> | null {
  if (!shape) return null
  return {
    viewBox: shape.viewBox,
    markupLength: shape.markup.length,
    clipMarkupLength: shape.clipMarkup.length,
    imageFillMarkupLength: shape.imageFillMarkup.length,
    markupPreview: shape.markup.slice(0, 240),
    clipMarkupPreview: shape.clipMarkup.slice(0, 240),
    imageFillMarkupPreview: shape.imageFillMarkup.slice(0, 240),
  }
}

function diaryGuideLayerClass(role: DiaryGuideLayer['role']): string {
  switch (role) {
    case 'body':
      return 'verify-preview__part--body'
    case 'spine':
      return 'verify-preview__part--spine'
    case 'camera':
      return 'verify-preview__part--camera'
    case 'stitch':
      return 'verify-preview__part--stitch'
    default:
      return 'verify-preview__part--body'
  }
}

function summarizeImageUrl(url: string | null): Record<string, unknown> | null {
  if (!url) return null
  return {
    prefix: url.slice(0, 64),
    length: url.length,
    isDataUrl: url.startsWith('data:'),
    isBlobUrl: url.startsWith('blob:'),
  }
}

function labelFromImageUrl(url: string, fallbackLabel?: string | null): string {
  const trimmed = url.trim()
  if (!trimmed) return fallbackLabel?.trim() || '（未設定）'
  if (trimmed.startsWith('data:')) return '選択中の画像（未アップロード）'
  if (trimmed.startsWith('blob:')) return 'プレビュー中のローカル画像'
  try {
    const last = new URL(trimmed).pathname.split('/').filter(Boolean).pop()
    if (last) return decodeURIComponent(last)
  } catch {
    // ignore
  }
  return fallbackLabel?.trim() || trimmed
}

/** commerce 手帳型は clip SVG を base_image_url に流用しているためラスタとして扱わない */
function isClipSvgUrl(url: string | null): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('_clip.svg') || lower.endsWith('/clip.svg')
}

function resolvePlacementCanvas(
  isDiaryCase: boolean,
  clipSize: PreviewSize,
  baseImageSize: PreviewSize | null,
): PreviewSize {
  if (isDiaryCase) return clipSize
  return baseImageSize ?? clipSize
}

function buildCoverTransform(canvas: PreviewSize, imageSize: PreviewSize): ImageTransform {
  const coverScale = Math.max(canvas.width / imageSize.width, canvas.height / imageSize.height)
  return {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
    imageWidth: imageSize.width * coverScale,
    imageHeight: imageSize.height * coverScale,
    scale: 1,
    rotationRad: 0,
  }
}

function buildDiaryCssMaskUrl(
  canvasSize: PreviewSize,
  printMask: DiaryPrintMask,
  guideTransform?: string,
): string {
  const gOpen = guideTransform ? `<g transform="${guideTransform}">` : '<g>'
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}">`,
    `<rect width="100%" height="100%" fill="black"/>`,
    gOpen,
    printMask.showMarkup,
    printMask.holeMarkup ?? '',
    '</g>',
    '</svg>',
  ].join('')
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

function diaryEmbedImageStyle(
  transform: ImageTransform,
  canvasSize: PreviewSize,
): CSSProperties {
  const w = transform.imageWidth * transform.scale
  const h = transform.imageHeight * transform.scale
  return {
    position: 'absolute',
    left: `${((transform.centerX - w / 2) / canvasSize.width) * 100}%`,
    top: `${((transform.centerY - h / 2) / canvasSize.height) * 100}%`,
    width: `${(w / canvasSize.width) * 100}%`,
    height: `${(h / canvasSize.height) * 100}%`,
    transform: `rotate(${radToDeg(transform.rotationRad)}deg)`,
    transformOrigin: 'center center',
    objectFit: 'none',
    pointerEvents: 'none',
    zIndex: 1,
  }
}

export type BulkEmbedPlacement = {
  centerX: number
  centerY: number
  imageWidth: number
  imageHeight: number
  scale: number
  rotationRad: number
}

export type BulkEmbedConfig = {
  parentOrigin: string
  deviceName: string
  initialDesignUrl?: string | null
  /** 列名など。URL からファイル名が取れないときのラベル */
  designLabel?: string | null
  /** マトリクス保存済み配置（VerifyPreview / commerce と同じ座標系） */
  initialPlacement?: BulkEmbedPlacement | null
}

function transformFromPlacement(placement: BulkEmbedPlacement): ImageTransform {
  return {
    centerX: placement.centerX,
    centerY: placement.centerY,
    imageWidth: placement.imageWidth,
    imageHeight: placement.imageHeight,
    scale: placement.scale,
    rotationRad: placement.rotationRad,
  }
}

export type BulkCellSaveMessage = {
  type: 'decocom:bulk-cell:save'
  variant: string
  designImageUrl: string | null
  placement: {
    centerX: number
    centerY: number
    imageWidth: number
    imageHeight: number
    scale: number
    rotationRad: number
  }
}

export function VerifyPreview({
  variant,
  embedBulk,
}: {
  variant: string
  embedBulk?: BulkEmbedConfig
}) {
  const clipId = useId().replace(/:/g, '')
  const imagePatternId = `${clipId}-image-pattern`
  const diaryMaskId = `${clipId}-diary-mask`

  const [spec, setSpec] = useState<PrintSpec | null>(null)
  const [specError, setSpecError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [printAreaShape, setPrintAreaShape] = useState<SvgShapeResult | null>(null)
  const [printAreaError, setPrintAreaError] = useState<string | null>(null)
  const [safeAreaShape, setSafeAreaShape] = useState<SvgShapeResult | null>(null)
  const [bleedAreaShape, setBleedAreaShape] = useState<SvgShapeResult | null>(null)
  const [diaryGuideLayers, setDiaryGuideLayers] = useState<DiaryGuideLayer[]>([])
  const [diaryPrintMask, setDiaryPrintMask] = useState<DiaryPrintMask | null>(null)
  const [showSafeArea, setShowSafeArea] = useState(true)
  const [showBleedArea, setShowBleedArea] = useState(true)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [transform, setTransform] = useState<ImageTransform | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [imageSourceLabel, setImageSourceLabel] = useState<string | null>(null)
  const [loadedBaseImage, setLoadedBaseImage] = useState<{ url: string; size: PreviewSize } | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  /** ユーザーが「画像を変更」したあと、baseImage 読込で initialDesignUrl を上書きしない */
  const userOverrodeImageRef = useRef(false)
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

  useEffect(() => {
    logDebug('mounted', { variant, clipId })
    return () => logDebug('unmounted', { variant, clipId })
  }, [clipId, variant])

  // Fetch spec + SVGs
  useEffect(() => {
    let cancelled = false

    async function load() {
      logDebug('load:start', { variant })
      setLoading(true)
      setSpecError(null)
      setPrintAreaError(null)
      setPrintAreaShape(null)
      setSafeAreaShape(null)
      setBleedAreaShape(null)
      setDiaryGuideLayers([])
      setDiaryPrintMask(null)

      try {
        const data = await fetchPrintSpec(variant)
        logDebug('fetchPrintSpec:success', {
          variant: data.variant,
          printSpec: data.print_spec,
          derivedBaseImageUrl: deriveBaseImageUrl(data.print_spec.print_area_svg_url),
        })
        if (cancelled) return
        setSpec(data)

        const isDiaryCase = data.product_type.code === 'diary-case'

        try {
          if (isDiaryCase) {
            const parts = await fetchAndParseDiaryCaseClip(data.print_spec.print_area_svg_url)
            if (!cancelled) {
              logDebug('parseCaseClip:success', {
                caseType: data.product_type.code,
                printArea: summarizeShape(parts.printArea),
                bleedArea: summarizeShape(parts.bleedArea),
                guideLayerIds: parts.guideLayers.map(layer => layer.id),
              })
              setPrintAreaShape(parts.printArea)
              setSafeAreaShape(null)
              setBleedAreaShape(parts.bleedArea)
              setDiaryGuideLayers(parts.guideLayers)
              setDiaryPrintMask(parts.printMask)
            }
          } else {
            const parts = await fetchAndParseGripCaseClip(data.print_spec.print_area_svg_url)
            if (!cancelled) {
              logDebug('parseCaseClip:success', {
                caseType: data.product_type.code,
                printArea: summarizeShape(parts.printArea),
                safeArea: summarizeShape(parts.safeArea),
                bleedArea: summarizeShape(parts.bleedArea),
              })
              setPrintAreaShape(parts.printArea)
              setSafeAreaShape(parts.safeArea)
              setBleedAreaShape(parts.bleedArea)
              setDiaryGuideLayers([])
              setDiaryPrintMask(null)
            }
          }
        } catch (e) {
          logWarn('parseCaseClip:failed; falling back to path parser', e)
          try {
            const pa = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.print_area_svg_url))
            if (!cancelled) {
              logDebug('fallbackPrintArea:success', summarizeShape(pa))
              setPrintAreaShape(pa)
            }

            if (data.print_spec.safe_area_svg_url) {
              try {
                const sa = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.safe_area_svg_url))
                if (!cancelled) {
                  logDebug('fallbackSafeArea:success', summarizeShape(sa))
                  setSafeAreaShape(sa)
                }
              } catch (err) {
                logWarn('fallbackSafeArea:failed', err)
              }
            }
            if (data.print_spec.bleed_area_svg_url) {
              try {
                const ba = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.bleed_area_svg_url))
                if (!cancelled) {
                  logDebug('fallbackBleedArea:success', summarizeShape(ba))
                  setBleedAreaShape(ba)
                }
              } catch (err) {
                logWarn('fallbackBleedArea:failed', err)
              }
            }
          } catch (err) {
            logError('fallbackPrintArea:failed', err)
            if (!cancelled) setPrintAreaError(e instanceof Error ? e.message : 'SVG 解析失敗')
          }
        }
      } catch (e) {
        logError('load:failed', e)
        if (!cancelled) setSpecError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        logDebug('load:done', { variant, cancelled })
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      logDebug('load:cancelled', { variant })
    }
  }, [variant])

  useEffect(() => {
    let cancelled = false
    const baseImageUrl = activeBaseImageUrl
    const isDiaryCase = spec?.product_type.code === 'diary-case'
    if (!baseImageUrl || (isDiaryCase && isClipSvgUrl(baseImageUrl))) {
      setLoadedBaseImage(null)
      return
    }

    logDebug('baseImage:readNaturalSize:start', { baseImageUrl })
    readNaturalSize(baseImageUrl)
      .then(size => {
        if (!cancelled) {
          logDebug('baseImage:readNaturalSize:success', { baseImageUrl, size })
          setLoadedBaseImage({ url: baseImageUrl, size })
        }
      })
      .catch(err => {
        logError('baseImage:readNaturalSize:failed', { baseImageUrl, err })
        if (!cancelled) {
          setLoadedBaseImage(null)
        }
      })

    return () => {
      cancelled = true
      logDebug('baseImage:readNaturalSize:cancelled', { baseImageUrl })
    }
  }, [activeBaseImageUrl, spec])

  // Image file handling
  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      logWarn('file:empty-selection')
      return
    }
    setFileError(null)
    e.target.value = ''
    logDebug('file:selected', {
      name: file.name,
      type: file.type,
      size: file.size,
      printAreaReady: Boolean(printAreaShape),
      baseImageSize,
    })

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      logWarn('file:unsupported-type', { type: file.type, name: file.name })
      setFileError('PNG/JPEG の画像を選んでください。')
      return
    }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      logWarn('file:too-large', { size: file.size, max: MAX_IMAGE_FILE_SIZE_BYTES })
      setFileError('画像サイズは10MB以下にしてください。')
      return
    }

    try {
      const url = await readFileAsDataUrl(file)
      logDebug('file:create-data-url', {
        prefix: url.slice(0, 48),
        length: url.length,
      })

      const size = await readNaturalSize(url)
      if (!printAreaShape) {
        logError('file:print-area-not-ready-after-read', { imageUrl: summarizeImageUrl(url), size })
        setFileError('印刷エリアの読み込み後にもう一度選択してください。')
        return
      }

      const isDiaryCase = spec?.product_type.code === 'diary-case'
      const canvas = resolvePlacementCanvas(isDiaryCase, printAreaShape.viewBox, baseImageSize)
      const nextTransform = buildCoverTransform(canvas, size)
      logDebug('file:ready-to-render', {
        imageUrl: summarizeImageUrl(url),
        naturalSize: size,
        canvas,
        nextTransform,
        clipId,
        imagePatternId,
        printAreaShape: summarizeShape(printAreaShape),
      })

      userOverrodeImageRef.current = true
      setImageUrl(url)
      setTransform(nextTransform)
      setImageSourceLabel(file.name)
    } catch (err) {
      logError('file:readNaturalSize:failed', err)
      setFileError(err instanceof Error ? err.message : '画像を読み込めませんでした')
    }
  }, [baseImageSize, clipId, imagePatternId, printAreaShape, spec])

  const applyDesignImage = useCallback(
    async (url: string, abort?: { cancelled: boolean }) => {
      setFileError(null)
      const size = await readNaturalSize(url)
      if (abort?.cancelled) return
      if (!printAreaShape) {
        setFileError('印刷エリアの読み込み後にもう一度お試しください。')
        return
      }
      if (size.width <= 0 || size.height <= 0) {
        setFileError('画像のサイズを取得できませんでした')
        return
      }
      const isDiaryCase = spec?.product_type.code === 'diary-case'
      const canvas = resolvePlacementCanvas(isDiaryCase, printAreaShape.viewBox, baseImageSize)
      const savedPlacement = embedBulk?.initialPlacement
      const nextTransform =
        savedPlacement != null
          ? transformFromPlacement(savedPlacement)
          : buildCoverTransform(canvas, size)
      if (abort?.cancelled) return
      setImageUrl(url)
      setTransform(nextTransform)
      setImageSourceLabel(labelFromImageUrl(url, embedBulk?.designLabel))
    },
    [baseImageSize, embedBulk?.designLabel, embedBulk?.initialPlacement, printAreaShape, spec],
  )

  useEffect(() => {
    userOverrodeImageRef.current = false
    setImageSourceLabel(null)
  }, [variant, embedBulk?.initialDesignUrl, embedBulk?.initialPlacement])

  useEffect(() => {
    const initialUrl = embedBulk?.initialDesignUrl?.trim()
    if (!initialUrl || !printAreaShape) return
    if (userOverrodeImageRef.current) return
    const abort = { cancelled: false }
    applyDesignImage(initialUrl, abort).catch(err => {
      if (!abort.cancelled) {
        setFileError(err instanceof Error ? err.message : '画像を読み込めませんでした')
      }
    })
    return () => {
      abort.cancelled = true
    }
  }, [
    applyDesignImage,
    embedBulk?.initialDesignUrl,
    embedBulk?.initialPlacement,
    printAreaShape,
    spec?.product_type.code,
  ])

  const postToParent = useCallback(
    (payload: BulkCellSaveMessage | { type: 'decocom:bulk-cell:cancel' }) => {
      const target = embedBulk?.parentOrigin ?? '*'
      window.parent.postMessage(payload, target)
    },
    [embedBulk?.parentOrigin],
  )

  const handleBulkSave = useCallback(() => {
    if (!transform || !imageUrl) {
      setFileError('画像を配置してから保存してください。')
      return
    }
    const message: BulkCellSaveMessage = {
      type: 'decocom:bulk-cell:save',
      variant,
      designImageUrl: imageUrl.startsWith('data:') ? imageUrl : imageUrl,
      placement: {
        centerX: transform.centerX,
        centerY: transform.centerY,
        imageWidth: transform.imageWidth,
        imageHeight: transform.imageHeight,
        scale: transform.scale,
        rotationRad: transform.rotationRad,
      },
    }
    postToParent(message)
  }, [imageUrl, postToParent, transform, variant])

  const updateTransform = useCallback((updater: (t: ImageTransform) => ImageTransform) => {
    setTransform(prev => {
      if (!prev) return prev
      const next = updater(prev)
      transformRef.current = next
      logDebug('transform:update', next)
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
    if (points.length >= 2 && !embedBulk) {
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
  }, [embedBulk, transform])

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

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !transform) return
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

  const baseImageUrl = activeBaseImageUrl
  const isDiaryCase = spec?.product_type.code === 'diary-case'
  const clipSize = printAreaShape?.viewBox
  const canvasSize = clipSize ? resolvePlacementCanvas(isDiaryCase, clipSize, baseImageSize) : null
  const showBaseImage = Boolean(baseImageUrl && !(isDiaryCase && isClipSvgUrl(baseImageUrl)))
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

  const diaryDesignMask =
    isDiaryCase && diaryPrintMask && canvasSize
      ? `url(#${diaryMaskId})`
      : undefined
  const gripDesignClip = !isDiaryCase ? `url(#${clipId})` : undefined
  // embed でも SVG マスクで描画。HTML img + object-fit は高解像度画像が実寸になりサイズが破綻する。
  const useDiaryHtmlDesign = false
  const diaryCssMaskUrl = useMemo(() => {
    if (!useDiaryHtmlDesign || !diaryPrintMask || !canvasSize) return null
    return buildDiaryCssMaskUrl(canvasSize, diaryPrintMask, guideTransform)
  }, [canvasSize, diaryPrintMask, guideTransform, useDiaryHtmlDesign])

  const placementInfo = useMemo(() => {
    if (!transform) return null
    return {
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
  }, [baseImageUrl, canvasSize, clipSize, guideScale, needsLegacyGuideTransform, transform, variant])

  useEffect(() => {
    logDebug('render-state', {
      variant,
      clipId,
      imagePatternId,
      loading,
      hasSpec: Boolean(spec),
      hasPrintAreaShape: Boolean(printAreaShape),
      hasSafeAreaShape: Boolean(safeAreaShape),
      hasBleedAreaShape: Boolean(bleedAreaShape),
      imageUrl: summarizeImageUrl(imageUrl),
      transform,
      baseImageUrl,
      baseImageSize,
      clipSize,
      canvasSize,
      viewBoxAttr,
      guideTransform,
      transformAttr,
      placementInfo,
    })
  }, [
    baseImageSize,
    baseImageUrl,
    canvasSize,
    clipId,
    clipSize,
    guideTransform,
    imageUrl,
    loading,
    placementInfo,
    printAreaShape,
    safeAreaShape,
    bleedAreaShape,
    spec,
    transform,
    transformAttr,
    variant,
    viewBoxAttr,
    imagePatternId,
  ])

  useEffect(() => {
    if (!printAreaShape || !canvasSize || !viewBoxAttr) return

    const frameId = window.requestAnimationFrame(() => {
      const svg = svgRef.current
      if (!svg) {
        logWarn('dom-inspect:no-svg')
        return
      }

      const clipPath = svg.querySelector(`#${CSS.escape(clipId)}`)
      const imagePattern = svg.querySelector(`#${CSS.escape(imagePatternId)}`)
      const imageFill = svg.querySelector('[data-verify-image-fill="true"]')
      const userImage = svg.querySelector('[data-verify-user-image="true"]') as SVGImageElement | null
      const baseImage = svg.querySelector('[data-verify-base-image="true"]') as SVGImageElement | null

      let userImageBBox: DOMRect | SVGRect | null = null
      try {
        userImageBBox = userImage?.getBBox() ?? null
      } catch (err) {
        logWarn('dom-inspect:user-image-getBBox-failed', err)
      }

      logDebug('dom-inspect', {
        svgViewBox: svg.getAttribute('viewBox'),
        svgClientRect: svg.getBoundingClientRect().toJSON(),
        clipSelector: `#${clipId}`,
        clipExists: Boolean(clipPath),
        clipChildElementCount: clipPath?.children.length ?? null,
        clipInnerHTMLPreview: clipPath?.innerHTML.slice(0, 500) ?? null,
        imagePatternExists: Boolean(imagePattern),
        imagePatternInnerHTMLPreview: imagePattern?.innerHTML.slice(0, 500) ?? null,
        imageFillExists: Boolean(imageFill),
        imageFillStyle: imageFill?.getAttribute('style') ?? null,
        imageFillInnerHTMLPreview: imageFill?.innerHTML.slice(0, 500) ?? null,
        userImageExists: Boolean(userImage),
        userImageHref: summarizeImageUrl(userImage?.getAttribute('href') ?? null),
        userImageBBox,
        baseImageExists: Boolean(baseImage),
        baseImageHref: summarizeImageUrl(baseImage?.getAttribute('href') ?? null),
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [canvasSize, clipId, imagePatternId, imageUrl, printAreaShape, transform, viewBoxAttr])

  // Loading
  if (loading) return <p>Loading...</p>
  if (specError) return <p style={{ color: 'red' }}>Error: {specError}</p>
  if (!spec) return <p style={{ color: 'red' }}>spec not loaded</p>

  const embedLayout = Boolean(embedBulk)
  const embedFitAspect =
    embedLayout && canvasSize
      ? `${canvasSize.width} / ${canvasSize.height}`
      : undefined

  return (
    <section
      style={{
        display: embedLayout ? 'flex' : undefined,
        flexDirection: embedLayout ? 'column' : undefined,
        height: embedLayout ? '100%' : undefined,
        minHeight: embedLayout ? 0 : undefined,
        maxWidth: embedLayout ? '100%' : 800,
        margin: '0 auto',
        padding: embedLayout ? 8 : 16,
        fontFamily: 'system-ui, sans-serif',
        boxSizing: 'border-box',
        overflow: embedLayout ? 'hidden' : undefined,
      }}
    >
      <header style={{ flexShrink: embedLayout ? 0 : undefined }}>
        <h1 style={{ fontSize: embedLayout ? 15 : 18, margin: embedLayout ? 0 : '0 0 8px' }}>
          {embedLayout
            ? `${embedBulk?.deviceName ?? spec.device.name}（${spec.product_type.name}）`
            : `Verify: ${spec.device.name} ${spec.product_type.name}`}
        </h1>

        {embedLayout ? (
          <div style={{ margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#616161' }}>
              プレビュー上をドラッグして位置を調整。拡大縮小は下のスライダーから。
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <label
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid #8c9196',
                  background: '#fff',
                  color: '#303030',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={onFile}
                  style={{ display: 'none' }}
                />
                画像を変更
              </label>
              {imageSourceLabel ? (
                <p style={{ margin: 0, fontSize: 12, color: '#616161' }}>
                  使用中: <strong style={{ color: '#303030' }}>{imageSourceLabel}</strong>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {!embedLayout ? (
        <details open>
          <summary>Print Spec (JSON)</summary>
          <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(spec, null, 2)}
          </pre>
        </details>
      ) : null}

      {!embedLayout ? (
        <div
          style={{
            margin: '12px 0',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <label style={{ padding: '6px 12px', background: '#4f46e5', color: '#fff', borderRadius: 4, cursor: 'pointer' }}>
            <input type="file" accept="image/png,image/jpeg" onChange={onFile} style={{ display: 'none' }} />
            画像を選ぶ
          </label>
          {safeAreaShape ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={showSafeArea} onChange={e => setShowSafeArea(e.target.checked)} />
              Safe Area
            </label>
          ) : null}
          {bleedAreaShape ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={showBleedArea} onChange={e => setShowBleedArea(e.target.checked)} />
              {isDiaryCase ? '塗り足し' : 'Bleed Area'}
            </label>
          ) : null}
        </div>
      ) : null}
      {fileError && <p style={{ color: 'red', flexShrink: embedLayout ? 0 : undefined }}>{fileError}</p>}

      {/* SVG errors */}
      {printAreaError && <p style={{ color: 'red' }}>Print Area SVG: {printAreaError}</p>}

      {/* SVG Preview */}
      {printAreaShape && canvasSize && viewBoxAttr && (
        <div
          style={{
            flex: embedLayout ? 1 : undefined,
            minHeight: embedLayout ? 0 : undefined,
            display: embedLayout ? 'flex' : undefined,
            alignItems: embedLayout ? 'center' : undefined,
            justifyContent: embedLayout ? 'center' : undefined,
            width: '100%',
          }}
        >
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              overflow: embedLayout ? 'visible' : 'hidden',
              background: '#f0f0f0',
              width: embedLayout ? '100%' : undefined,
              flex: embedLayout ? 1 : undefined,
              minHeight: embedLayout ? 0 : undefined,
              maxWidth: '100%',
              maxHeight: embedLayout ? '100%' : undefined,
              padding: embedLayout ? 8 : 0,
              boxSizing: 'border-box',
              display: embedLayout ? 'flex' : undefined,
              alignItems: embedLayout ? 'center' : undefined,
              justifyContent: embedLayout ? 'center' : undefined,
            }}
          >
            <div
              style={
                embedFitAspect
                  ? {
                      aspectRatio: embedFitAspect,
                      width: '100%',
                      height: 'auto',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      flexShrink: 0,
                      position: useDiaryHtmlDesign ? 'relative' : undefined,
                    }
                  : { width: '100%', position: useDiaryHtmlDesign ? 'relative' : undefined }
              }
            >
              {useDiaryHtmlDesign && imageUrl && transform && diaryCssMaskUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  data-verify-user-html-image="true"
                  style={{
                    ...diaryEmbedImageStyle(transform, canvasSize),
                    maskImage: diaryCssMaskUrl,
                    WebkitMaskImage: diaryCssMaskUrl,
                    maskSize: '100% 100%',
                    WebkitMaskSize: '100% 100%',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                  }}
                  onLoad={() => logDebug('user-html-image:onLoad', {
                    imageUrl: summarizeImageUrl(imageUrl),
                    transform,
                    diaryCssMaskUrl: diaryCssMaskUrl.slice(0, 80),
                  })}
                  onError={() => logError('user-html-image:onError', {
                    imageUrl: summarizeImageUrl(imageUrl),
                  })}
                />
              ) : null}
              <svg
            ref={svgRef}
            viewBox={viewBoxAttr}
            preserveAspectRatio="xMidYMid meet"
            style={{
              display: 'block',
              width: '100%',
              height: embedLayout ? (useDiaryHtmlDesign ? '100%' : 'auto') : undefined,
              margin: '0 auto',
              maxHeight: embedLayout ? undefined : '70vh',
              touchAction: 'none',
              position: useDiaryHtmlDesign ? 'absolute' : undefined,
              inset: useDiaryHtmlDesign ? 0 : undefined,
              zIndex: useDiaryHtmlDesign ? 2 : undefined,
              background: useDiaryHtmlDesign ? 'transparent' : undefined,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onWheel={embedBulk ? undefined : onWheel}
          >
            <style>
              {`
                .verify-preview__part--paper * {
                  fill: #fff !important;
                  stroke: #d1d5db !important;
                  stroke-width: 0.5 !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--body * {
                  fill: rgba(96, 64, 42, 0.14) !important;
                  stroke: rgba(78, 52, 34, 0.72) !important;
                  stroke-width: 0.75px !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--spine * {
                  fill: rgba(200, 200, 200, 0.28) !important;
                  stroke: rgba(120, 120, 120, 0.75) !important;
                  stroke-width: 0.75px !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--camera * {
                  fill: rgba(24, 24, 24, 0.1) !important;
                  stroke: rgba(24, 24, 24, 0.55) !important;
                  stroke-width: 1px !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--stitch * {
                  fill: none !important;
                  stroke: rgba(255, 255, 255, 0.95) !important;
                  stroke-width: 1.5px !important;
                  stroke-dasharray: 6 3 !important;
                  stroke-linecap: round !important;
                  stroke-linejoin: round !important;
                  vector-effect: non-scaling-stroke;
                  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
                }
                .verify-preview__clip-shape * {
                  fill: #000 !important;
                  stroke: none !important;
                }
                .verify-preview__image-fill * {
                  fill: url(#${imagePatternId}) !important;
                  stroke: none !important;
                }
                .verify-preview__part--print * {
                  fill: none !important;
                  stroke: rgba(0, 153, 255, 0.72) !important;
                  stroke-width: 1 !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--safe * {
                  fill: none !important;
                  stroke: rgba(255, 0, 0, 0.58) !important;
                  stroke-width: 1.25 !important;
                  stroke-dasharray: 8 4 !important;
                  vector-effect: non-scaling-stroke;
                }
                .verify-preview__part--bleed * {
                  fill: none !important;
                  stroke: rgba(0, 180, 70, 0.58) !important;
                  stroke-width: 1.25 !important;
                  stroke-dasharray: 8 4 !important;
                  vector-effect: non-scaling-stroke;
                }
              `}
            </style>
            <defs>
              {isDiaryCase && diaryPrintMask && canvasSize ? (
                <mask
                  id={diaryMaskId}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="0"
                    y="0"
                    width={canvasSize.width}
                    height={canvasSize.height}
                    fill="#000000"
                  />
                  <g transform={guideTransform}>
                    <g dangerouslySetInnerHTML={{ __html: diaryPrintMask.showMarkup }} />
                    {diaryPrintMask.holeMarkup ? (
                      <g dangerouslySetInnerHTML={{ __html: diaryPrintMask.holeMarkup }} />
                    ) : null}
                  </g>
                </mask>
              ) : null}
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <g
                  transform={guideTransform}
                  dangerouslySetInnerHTML={{ __html: printAreaShape.clipMarkup }}
                />
              </clipPath>
              {imageUrl && transform && transformAttr && (
                <pattern
                  id={imagePatternId}
                  patternUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width={canvasSize.width}
                  height={canvasSize.height}
                >
                  <g transform={transformAttr}>
                    <image
                      data-verify-user-pattern-image="true"
                      href={imageUrl}
                      x={-transform.imageWidth / 2}
                      y={-transform.imageHeight / 2}
                      width={transform.imageWidth}
                      height={transform.imageHeight}
                      preserveAspectRatio="none"
                      onLoad={() => logDebug('user-pattern-image:onLoad', {
                        imageUrl: summarizeImageUrl(imageUrl),
                        transform,
                        transformAttr,
                        imagePatternId,
                      })}
                      onError={event => logError('user-pattern-image:onError', {
                        imageUrl: summarizeImageUrl(imageUrl),
                        currentSrc: summarizeImageUrl(event.currentTarget.href.baseVal),
                        transform,
                        transformAttr,
                        imagePatternId,
                      })}
                    />
                  </g>
                </pattern>
              )}
            </defs>

            {!isDiaryCase ? (
              <g className="verify-preview__part--paper">
                <g
                  transform={guideTransform}
                  dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
                />
              </g>
            ) : (
              diaryGuideLayers
                .filter(layer => layer.role === 'body' || layer.role === 'spine')
                .map(layer => (
                  <g key={layer.id} className={diaryGuideLayerClass(layer.role)}>
                    <g
                      transform={guideTransform}
                      dangerouslySetInnerHTML={{ __html: layer.markup }}
                    />
                  </g>
                ))
            )}

            {/* Base image */}
            {showBaseImage && baseImageUrl && (
              <image
                data-verify-base-image="true"
                href={baseImageUrl}
                x="0"
                y="0"
                width={canvasSize.width}
                height={canvasSize.height}
                preserveAspectRatio="none"
                onLoad={() => logDebug('base-image-element:onLoad', { baseImageUrl, canvasSize })}
                onError={event => logError('base-image-element:onError', {
                  baseImageUrl,
                  currentSrc: event.currentTarget.href.baseVal,
                })}
              />
            )}

            {!sameViewBox(printAreaShape, safeAreaShape) || !sameViewBox(printAreaShape, bleedAreaShape) ? (
              <text x="12" y="24" fill="#b45309" fontSize="14">
                guide viewBox mismatch
              </text>
            ) : null}

            {/* User image clipped/masked to print area */}
            {imageUrl && transform && transformAttr && !useDiaryHtmlDesign ? (
              <g mask={diaryDesignMask} clipPath={gripDesignClip}>
                <g transform={transformAttr}>
                  <image
                    data-verify-user-image="true"
                    href={imageUrl}
                    x={-transform.imageWidth / 2}
                    y={-transform.imageHeight / 2}
                    width={transform.imageWidth}
                    height={transform.imageHeight}
                    preserveAspectRatio="xMidYMid meet"
                    onLoad={() => logDebug('user-image-element:onLoad', {
                      imageUrl: summarizeImageUrl(imageUrl),
                      transform,
                      transformAttr,
                      clipId,
                      diaryMaskId,
                    })}
                    onError={event => logError('user-image-element:onError', {
                      imageUrl: summarizeImageUrl(imageUrl),
                      currentSrc: summarizeImageUrl(event.currentTarget.href.baseVal),
                      transform,
                      transformAttr,
                      clipId,
                      diaryMaskId,
                    })}
                  />
                </g>
                <g
                  data-verify-image-fill="true"
                  className="verify-preview__image-fill"
                  transform={guideTransform}
                  dangerouslySetInnerHTML={{ __html: printAreaShape.imageFillMarkup }}
                />
              </g>
            ) : null}

            {isDiaryCase
              ? diaryGuideLayers
                  .filter(layer => layer.role === 'stitch' || layer.role === 'camera')
                  .map(layer => (
                    <g key={layer.id} className={diaryGuideLayerClass(layer.role)}>
                      <g
                        transform={guideTransform}
                        dangerouslySetInnerHTML={{ __html: layer.markup }}
                      />
                    </g>
                  ))
              : null}

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
          </div>
        </div>
      )}

      {!embedLayout ? (
        <details open style={{ marginTop: 12 }}>
          <summary>Placement Info (JSON)</summary>
          <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(placementInfo, null, 2)}
          </pre>
        </details>
      ) : null}

      {embedBulk ? (
        <div
          style={{
            flexShrink: 0,
            padding: '10px 12px',
            background: '#f6f6f7',
            borderTop: '1px solid #e3e3e5',
          }}
        >
          {transform ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', margin: 0 }}>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', fontWeight: 600, color: '#303030' }}>
                拡大縮小
              </span>
              <input
                type="range"
                min={IMAGE_MIN_SCALE}
                max={IMAGE_MAX_SCALE}
                step={0.05}
                value={transform.scale}
                style={{ flex: 1, minWidth: 0 }}
                onChange={e => {
                  const nextScale = clamp(Number(e.target.value), IMAGE_MIN_SCALE, IMAGE_MAX_SCALE)
                  updateTransform(t => ({ ...t, scale: nextScale }))
                }}
              />
              <span style={{ fontSize: 12, color: '#616161', minWidth: 40, textAlign: 'right' }}>
                {Math.round(transform.scale * 100)}%
              </span>
            </label>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: '#616161' }}>
              上の「画像を変更」で画像を選ぶと拡大縮小できます
            </p>
          )}
        </div>
      ) : null}

      {embedBulk ? (
        <footer
          style={{
            flexShrink: 0,
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            padding: '10px 12px',
            background: '#fff',
            borderTop: '1px solid #e3e3e5',
          }}
        >
          <button
            type="button"
            onClick={() => postToParent({ type: 'decocom:bulk-cell:cancel' })}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #c9cccf',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleBulkSave}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#008060',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            保存
          </button>
        </footer>
      ) : null}
    </section>
  )
}
