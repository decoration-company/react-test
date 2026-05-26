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
import { fetchPrintSpec, type PrintSpec } from '../verify/fetchPrintSpec'
import {
  fetchAndParseGripCaseClip,
  fetchAndParseSvgPath,
  svgPathToShape,
  type SvgShapeResult,
} from '../verify/parseSvgPath'
import { uploadImage, renderDesign, renderProductVariant, type RenderDesignResponse } from '../api/commerce'
import {
  PIXEL_9A_CASE_CLIP_PATH_BOUNDS,
  PIXEL_9A_CASE_CLIP_PATH_D,
} from './constants'
import { createRenderPayload } from './transform'
import './Pixel9aCaseMaskPreview.css'

const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])
const IMAGE_MIN_SCALE = 0.1
const IMAGE_MAX_SCALE = 4

const LEGACY_PIXEL_9A_VARIANTS = new Set(['pixel-9a', 'pixel9a', 'pixel-9a-hardcase'])

const PIXEL_9A_FALLBACK_SPEC: PrintSpec = {
  variant: 'pixel-9a',
  device: {
    code: 'pixel-9a',
    name: 'Google Pixel 9a',
  },
  product_type: {
    code: 'hard-case',
    name: 'ハードケース',
  },
  print_spec: {
    print_width: Math.round(PIXEL_9A_CASE_CLIP_PATH_BOUNDS.width),
    print_height: Math.round(PIXEL_9A_CASE_CLIP_PATH_BOUNDS.height),
    print_area_svg_url: '',
    base_image_url: null,
    safe_area_svg_url: null,
    bleed_area_svg_url: null,
  },
}

const PIXEL_9A_FALLBACK_SHAPE = svgPathToShape({
  d: PIXEL_9A_CASE_CLIP_PATH_D,
  fillRule: 'evenodd',
  viewBox: {
    width: PIXEL_9A_CASE_CLIP_PATH_BOUNDS.width,
    height: PIXEL_9A_CASE_CLIP_PATH_BOUNDS.height,
  },
})

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

type ShopifyDesignReadyMessage = {
  type: 'decocom:design:ready'
  variant: string
  spec_id: string
  design_id: string
  composed_image_url: string
  preview_image_url: string
  preview_url: string
  print_image_url: string
  thumbnail_image_url: string
}

function embeddedParentOrigin(): string {
  const params = new URLSearchParams(window.location.search)
  const origin = params.get('origin') ?? params.get('parent_origin') ?? '*'
  if (origin === '*') return origin
  try {
    return new URL(origin).origin
  } catch {
    return '*'
  }
}

function isShopifyEmbedUrl(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('embed') === 'shopify' || params.get('platform') === 'shopify'
}

function distance(a: DOMPoint, b: DOMPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function angleOf(a: DOMPoint, b: DOMPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function midpoint(a: DOMPoint, b: DOMPoint): DOMPoint {
  return new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
}

function clampScale(scale: number): number {
  return Math.min(Math.max(scale, IMAGE_MIN_SCALE), IMAGE_MAX_SCALE)
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('画像データを読み込めませんでした'))
    }
    reader.onerror = () => reject(new Error('画像データを読み込めませんでした'))
    reader.readAsDataURL(file)
  })
}

function readNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('画像を読み込めませんでした'))
    img.src = src
  })
}

function createCoverTransform(
  naturalWidth: number,
  naturalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): ImageTransform {
  const coverScale = Math.max(canvasWidth / naturalWidth, canvasHeight / naturalHeight)
  return {
    centerX: canvasWidth / 2,
    centerY: canvasHeight / 2,
    imageWidth: naturalWidth * coverScale,
    imageHeight: naturalHeight * coverScale,
    scale: 1,
    rotationRad: 0,
  }
}

function isLegacyPixel9aVariant(variant: string | null): boolean {
  return LEGACY_PIXEL_9A_VARIANTS.has((variant ?? '').toLowerCase())
}

export function Pixel9aCaseMaskPreview({ variant }: { variant: string | null }) {
  const clipId = useId().replace(/:/g, '')
  const innerBevelId = `${clipId}-inner-bevel`
  const edgeGradientId = `${clipId}-edge-gradient`
  const glassGradientId = `${clipId}-glass-gradient`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, DOMPoint>())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform | null>(null)

  const [spec, setSpec] = useState<PrintSpec | null>(null)
  const [specLoading, setSpecLoading] = useState(true)
  const [specError, setSpecError] = useState<string | null>(null)
  const [printAreaShape, setPrintAreaShape] = useState<SvgShapeResult | null>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [transform, setTransform] = useState<ImageTransform | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<RenderDesignResponse | null>(null)

  const parentOrigin = useMemo(() => embeddedParentOrigin(), [])
  const isShopifyEmbed = useMemo(() => isShopifyEmbedUrl(), [])

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  // Print spec + SVG clip path を動的取得
  useEffect(() => {
    if (!variant) return
    let cancelled = false

    async function load() {
      setSpecLoading(true)
      setSpecError(null)
      setSpec(null)
      setPrintAreaShape(null)

      try {
        if (isLegacyPixel9aVariant(variant)) {
          if (!cancelled) {
            setSpec(PIXEL_9A_FALLBACK_SPEC)
            setPrintAreaShape(PIXEL_9A_FALLBACK_SHAPE)
          }
          return
        }

        const data = await fetchPrintSpec(variant!)
        if (cancelled) return
        setSpec(data)

        // グリップケース専用パーサー → 汎用パーサーの順で fallback
        try {
          const parts = await fetchAndParseGripCaseClip(data.print_spec.print_area_svg_url)
          if (!cancelled) setPrintAreaShape(parts.printArea)
        } catch {
          try {
            const pa = svgPathToShape(await fetchAndParseSvgPath(data.print_spec.print_area_svg_url))
            if (!cancelled) setPrintAreaShape(pa)
          } catch (e) {
            if (!cancelled) setSpecError(e instanceof Error ? e.message : 'SVG の解析に失敗しました')
          }
        }
      } catch (e) {
        if (!cancelled) setSpecError(e instanceof Error ? e.message : 'スペックの読み込みに失敗しました')
      } finally {
        if (!cancelled) setSpecLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [variant])

  const canvasSize = printAreaShape?.viewBox ?? null

  const updateTransform = useCallback((updater: (t: ImageTransform) => ImageTransform) => {
    setTransform(prev => {
      if (!prev) return prev
      const next = updater(prev)
      transformRef.current = next
      return next
    })
  }, [])

  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    setSaveResult(null)
    e.target.value = ''

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setFileError('PNG/JPEG の画像を選んでください。')
      return
    }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      setFileError('画像サイズは10MB以下にしてください。')
      return
    }

    try {
      const url = await readFileAsDataUrl(file)
      const size = await readNaturalSize(url)
      const canvas = canvasSize ?? { width: 400, height: 860 }
      setSelectedFile(file)
      setImageUrl(url)
      setTransform(createCoverTransform(size.width, size.height, canvas.width, canvas.height))
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '画像を読み込めませんでした')
    }
  }, [canvasSize])

  // 「カートに入れる」/「印刷PNG生成」
  // Step 1: commerce にファイルをアップロード
  // Step 2: variant + placement で commerce render
  // Shopify embed の場合 → postMessage で完了
  // 非 embed の場合 → saveResult に保持して UI に表示
  const onSave = useCallback(async () => {
    if (!selectedFile || !transform || !variant) {
      setSaveError('画像を選んでから保存してください。')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveResult(null)

    try {
      const uploaded = await uploadImage(selectedFile)
      const result = isLegacyPixel9aVariant(variant)
        ? await renderDesign(createRenderPayload({
          id: 'pixel-9a-editor-image',
          sourceImageUrl: uploaded.source_image_url,
          naturalWidth: transform.imageWidth,
          naturalHeight: transform.imageHeight,
          transform,
        }))
        : await renderProductVariant(variant, {
          source_image_url: uploaded.source_image_url,
          placement: {
            centerX: transform.centerX,
            centerY: transform.centerY,
            imageWidth: transform.imageWidth,
            imageHeight: transform.imageHeight,
            scale: transform.scale,
            rotationRad: transform.rotationRad,
          },
        })

      if (isShopifyEmbed) {
        const message: ShopifyDesignReadyMessage = {
          type: 'decocom:design:ready',
          variant,
          spec_id: result.design_id,
          design_id: result.design_id,
          composed_image_url: result.composed_image_url,
          preview_image_url: result.preview_image_url,
          preview_url: result.preview_image_url,
          print_image_url: result.composed_image_url,
          thumbnail_image_url: result.preview_image_url,
        }
        window.parent.postMessage(message, parentOrigin)
        return
      }

      setSaveResult(result)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました。もう一度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }, [isShopifyEmbed, parentOrigin, selectedFile, transform, variant])

  const sendDesignToShopify = useCallback(() => {
    if (!saveResult || !variant) return
    const message: ShopifyDesignReadyMessage = {
      type: 'decocom:design:ready',
      variant,
      spec_id: saveResult.design_id,
      design_id: saveResult.design_id,
      composed_image_url: saveResult.composed_image_url,
      preview_image_url: saveResult.preview_image_url,
      preview_url: saveResult.preview_image_url,
      print_image_url: saveResult.composed_image_url,
      thumbnail_image_url: saveResult.preview_image_url,
    }
    window.parent.postMessage(message, parentOrigin)
  }, [parentOrigin, saveResult, variant])

  // ── Gesture handlers ────────────────────────────────────────────

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
        startDistance: distance(points[0], points[1]),
        startAngle: angleOf(points[0], points[1]),
        startCenter: midpoint(points[0], points[1]),
        startTransform: transform,
      }
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
      updateTransform(t => ({
        ...t,
        centerX: gesture.startTransform.centerX + point.x - gesture.startPoint.x,
        centerY: gesture.startTransform.centerY + point.y - gesture.startPoint.y,
      }))
      return
    }

    const points = [...pointersRef.current.values()]
    if (points.length < 2 || gesture.startDistance === 0) return
    const currentCenter = midpoint(points[0], points[1])
    const nextScale = clampScale(
      gesture.startTransform.scale * (distance(points[0], points[1]) / gesture.startDistance),
    )
    updateTransform(() => ({
      ...gesture.startTransform,
      centerX: gesture.startTransform.centerX + currentCenter.x - gesture.startCenter.x,
      centerY: gesture.startTransform.centerY + currentCenter.y - gesture.startCenter.y,
      scale: nextScale,
      rotationRad: gesture.startTransform.rotationRad + angleOf(points[0], points[1]) - gesture.startAngle,
    }))
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

  const onWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !transform) return
    event.preventDefault()
    const point = clientToSvg(svg, event.clientX, event.clientY)
    const factor = Math.exp(-event.deltaY * 0.001)
    updateTransform(t => {
      const nextScale = clampScale(t.scale * factor)
      const ratio = nextScale / t.scale
      return {
        ...t,
        centerX: point.x - (point.x - t.centerX) * ratio,
        centerY: point.y - (point.y - t.centerY) * ratio,
        scale: nextScale,
      }
    })
  }, [transform, updateTransform])

  const rotateBy = useCallback((deltaRad: number) => {
    updateTransform(t => ({ ...t, rotationRad: t.rotationRad + deltaRad }))
  }, [updateTransform])

  // ── Derived values ───────────────────────────────────────────────

  const viewBoxAttr = canvasSize ? `0 0 ${canvasSize.width} ${canvasSize.height}` : undefined
  const transformAttr = transform
    ? `translate(${transform.centerX} ${transform.centerY}) rotate(${radToDeg(transform.rotationRad)}) scale(${transform.scale})`
    : undefined

  // ── Early returns ────────────────────────────────────────────────

  if (!variant) {
    return (
      <section className="pixel9a-case-mask">
        <p className="pixel9a-case-mask__error">
          variant パラメータが指定されていません。URL に <code>?variant=xxx</code> を付けてください。
        </p>
      </section>
    )
  }

  if (specLoading) {
    return (
      <section className="pixel9a-case-mask">
        <p>読み込み中...</p>
      </section>
    )
  }

  if (specError || !spec) {
    return (
      <section className="pixel9a-case-mask">
        <p className="pixel9a-case-mask__error">
          読み込みに失敗しました: {specError ?? '不明なエラー'}
        </p>
      </section>
    )
  }

  // ── Main render ──────────────────────────────────────────────────

  return (
    <section className="pixel9a-case-mask" aria-label={`${spec.device.name} ${spec.product_type.name} エディタ`}>
      <h1 className="pixel9a-case-mask__title">{spec.device.name} {spec.product_type.name}</h1>
      <div className="pixel9a-case-mask__controls">
        <label className="pixel9a-case-mask__file">
          <input
            className="pixel9a-case-mask__file-input"
            type="file"
            accept="image/png,image/jpeg"
            onChange={onFile}
          />
          画像を選ぶ
        </label>
        <button
          type="button"
          className="pixel9a-case-mask__reset"
          onClick={() => rotateBy(-Math.PI / 12)}
          disabled={!transform}
        >
          左回転
        </button>
        <button
          type="button"
          className="pixel9a-case-mask__reset"
          onClick={() => rotateBy(Math.PI / 12)}
          disabled={!transform}
        >
          右回転
        </button>
        <button
          type="button"
          className="pixel9a-case-mask__save"
          onClick={onSave}
          disabled={!selectedFile || !transform || isSaving}
        >
          {isSaving ? '生成中...' : isShopifyEmbed ? 'カートに入れる' : '印刷PNG生成'}
        </button>
      </div>

      {fileError ? <p className="pixel9a-case-mask__error">{fileError}</p> : null}
      {saveError ? <p className="pixel9a-case-mask__error">{saveError}</p> : null}

      {saveResult && !isShopifyEmbed ? (
        <div className="pixel9a-case-mask__save-result">
          <output>design_id: {saveResult.design_id}</output>
          <a href={saveResult.composed_image_url} target="_blank" rel="noreferrer">
            composed_image_url
          </a>
          {parentOrigin !== '*' ? (
            <button type="button" className="pixel9a-case-mask__save" onClick={sendDesignToShopify}>
              このデザインで購入へ
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pixel9a-case-mask__stage">
        {printAreaShape && canvasSize && viewBoxAttr ? (
          <svg
            ref={svgRef}
            className="pixel9a-case-mask__svg"
            viewBox={viewBoxAttr}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onWheel={onWheel}
          >
            <style>{`
              .editor-shape-shadow, .editor-shape-material, .editor-shape-bevel, .editor-shape-glass, .editor-shape-outline { pointer-events: none; }
              .editor-shape-shadow * { fill: #ffffff; stroke: transparent; stroke-width: 0; }
              .editor-shape-material * { fill: url(#${edgeGradientId}); stroke: rgba(255, 255, 255, 0.78); stroke-width: 0.9; vector-effect: non-scaling-stroke; }
              .editor-shape-bg * { fill: rgba(255, 255, 255, 0.92); stroke: transparent; stroke-width: 0; vector-effect: non-scaling-stroke; }
              .editor-shape-bevel * { fill: none; stroke: rgba(255, 255, 255, 0.01); stroke-width: 1.8; vector-effect: non-scaling-stroke; }
              .editor-shape-glass * { fill: url(#${glassGradientId}); stroke: transparent; stroke-width: 0; mix-blend-mode: screen; }
              .editor-shape-outline * { fill: none; stroke: rgba(17, 24, 39, 0.42); stroke-width: 0.9; vector-effect: non-scaling-stroke; }
            `}</style>
            <defs>
              <linearGradient id={edgeGradientId} x1="0" y1="0" x2={canvasSize.width} y2={canvasSize.height} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="42%" stopColor="#f8fafc" stopOpacity="0.9" />
                <stop offset="72%" stopColor="#e5e7eb" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#111827" stopOpacity="0.16" />
              </linearGradient>
              <linearGradient id={glassGradientId} x1={canvasSize.width * 0.12} y1={canvasSize.height * 0.02} x2={canvasSize.width * 0.88} y2={canvasSize.height * 0.98} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.48" />
                <stop offset="26%" stopColor="#ffffff" stopOpacity="0.08" />
                <stop offset="43%" stopColor="#ffffff" stopOpacity="0.32" />
                <stop offset="62%" stopColor="#ffffff" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.20" />
              </linearGradient>
              <filter
                id={innerBevelId}
                x={-canvasSize.width * 0.12}
                y={-canvasSize.height * 0.08}
                width={canvasSize.width * 1.24}
                height={canvasSize.height * 1.16}
                filterUnits="userSpaceOnUse"
                primitiveUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="blur" />
                <feOffset in="blur" dx="0.8" dy="1.2" result="darkEdge" />
                <feComposite in="darkEdge" in2="SourceAlpha" operator="out" result="darkRim" />
                <feFlood floodColor="#000000" floodOpacity="0.18" result="darkColor" />
                <feComposite in="darkColor" in2="darkRim" operator="in" result="dark" />
                <feOffset in="blur" dx="-0.8" dy="-1.1" result="lightEdge" />
                <feComposite in="lightEdge" in2="SourceAlpha" operator="out" result="lightRim" />
                <feFlood floodColor="#ffffff" floodOpacity="0.58" result="lightColor" />
                <feComposite in="lightColor" in2="lightRim" operator="in" result="light" />
                <feMerge>
                  <feMergeNode in="dark" />
                  <feMergeNode in="light" />
                </feMerge>
              </filter>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <g dangerouslySetInnerHTML={{ __html: printAreaShape.clipMarkup }} />
              </clipPath>
            </defs>
            {/* Flutter版のSvgCaseShadowPainter相当の多層影 */}
            <g
              className="editor-shape-shadow"
              dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
            />
            {/* ケース本体の厚み・側面ハイライト */}
            <g
              className="editor-shape-material"
              dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
            />
            {/* ケース形状の白背景 */}
            <g
              className="editor-shape-bg"
              dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
            />
            {/* ユーザー画像（ケース形状でクリップ） */}
            {imageUrl && transform && transformAttr ? (
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
            ) : null}
            {/* クリップ境界の内側ベベル */}
            <g
              className="editor-shape-bevel"
              filter={`url(#${innerBevelId})`}
              dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
            />
            {/* 画面ガラス風の斜め反射 */}
            <g
              className="editor-shape-glass"
              clipPath={`url(#${clipId})`}
              dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
            />
            {/* ケース形状のアウトライン（最前面） */}
            <g
              className="editor-shape-outline"
              dangerouslySetInnerHTML={{ __html: printAreaShape.markup }}
            />
          </svg>
        ) : (
          <p>SVG を読み込み中...</p>
        )}
      </div>

      {saveResult ? (
        <figure className="pixel9a-case-mask__rendered">
          <img src={saveResult.composed_image_url} alt="生成された印刷用PNG" />
        </figure>
      ) : null}
    </section>
  )
}
