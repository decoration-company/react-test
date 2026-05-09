import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  renderDesign,
  renderProductVariant,
  uploadImage,
  type ProductRenderPlacement,
  type RenderDesignResponse,
} from '../api/commerce'
import { PIXEL_9A_CASE_CLIP_PATH_D } from '../pixel9a/constants'
import { PIXEL_9A_DESIGN_AREA, createRenderPayload } from '../pixel9a/transform'
import { fetchPrintSpec } from '../verify/fetchPrintSpec'
import { fetchAndParseGripCaseClip } from '../verify/parseSvgPath'

type RenderTarget = {
  label: string
  mode: 'legacy-pixel9a' | 'variant'
  variant: string
}

type CanvasSize = {
  width: number
  height: number
}

type Placement = ProductRenderPlacement

const TARGETS: RenderTarget[] = [
  { label: 'Pixel 9a', mode: 'legacy-pixel9a', variant: 'pixel-9a' },
  { label: 'iPhone 17 グリップ', mode: 'variant', variant: 'iphone-17-grip-case' },
]

function readNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('画像を読み込めませんでした'))
    img.src = src
  })
}

function coverPlacement(image: { width: number; height: number }, canvas: CanvasSize): Placement {
  const coverScale = Math.max(canvas.width / image.width, canvas.height / image.height)
  return {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
    imageWidth: image.width * coverScale,
    imageHeight: image.height * coverScale,
    scale: 1,
    rotationRad: 0,
  }
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function RenderTestPage() {
  const [targetVariant, setTargetVariant] = useState(TARGETS[0].variant)
  const target = TARGETS.find(item => item.variant === targetVariant) ?? TARGETS[0]

  const [canvasSize, setCanvasSize] = useState<CanvasSize>(PIXEL_9A_DESIGN_AREA)
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null)
  const [baseImageLoadFailed, setBaseImageLoadFailed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [loadingSpec, setLoadingSpec] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RenderDesignResponse | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    let cancelled = false

    async function loadTarget() {
      setError(null)
      setResult(null)
      setBaseImageLoadFailed(false)
      setLoadingSpec(true)
      try {
        if (target.mode === 'legacy-pixel9a') {
          if (!cancelled) {
            setCanvasSize(PIXEL_9A_DESIGN_AREA)
            setBaseImageUrl(null)
          }
          return
        }

        const spec = await fetchPrintSpec(target.variant)
        const parts = await fetchAndParseGripCaseClip(spec.print_spec.print_area_svg_url)
        const baseImageUrl = spec.print_spec.base_image_url
        const usableBaseImageUrl = baseImageUrl
          ? await readNaturalSize(baseImageUrl).then(() => baseImageUrl).catch(() => null)
          : null
        if (!cancelled) {
          setCanvasSize(parts.printArea.viewBox)
          setBaseImageUrl(usableBaseImageUrl)
          setBaseImageLoadFailed(false)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '印刷仕様の読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoadingSpec(false)
      }
    }

    loadTarget()
    return () => { cancelled = true }
  }, [target.mode, target.variant])

  useEffect(() => {
    let cancelled = false
    if (!previewUrl) return

    readNaturalSize(previewUrl)
      .then(size => {
        if (!cancelled) setPlacement(coverPlacement(size, canvasSize))
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : '画像を読み込めませんでした')
      })

    return () => { cancelled = true }
  }, [canvasSize, previewUrl])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const onFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setCopyState('idle')
    setSelectedFile(file)
    setPlacement(null)
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    event.target.value = ''
  }, [])

  const updatePlacement = useCallback((patch: Partial<Placement>) => {
    setPlacement(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  const onRender = useCallback(async () => {
    if (!selectedFile || !placement) {
      setError('画像を選択してください')
      return
    }

    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const uploaded = await uploadImage(selectedFile)
      if (target.mode === 'legacy-pixel9a') {
        const response = await renderDesign(createRenderPayload({
          id: 'test-render-image',
          sourceImageUrl: uploaded.source_image_url,
          naturalWidth: placement.imageWidth,
          naturalHeight: placement.imageHeight,
          transform: placement,
        }))
        setResult(response)
        return
      }

      const response = await renderProductVariant(target.variant, {
        source_image_url: uploaded.source_image_url,
        placement,
      })
      setResult(response)
      setCopyState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : '印刷データ生成に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [placement, selectedFile, target.mode, target.variant])

  const copyResultUrl = useCallback(async () => {
    if (!result?.composed_image_url) return
    try {
      await navigator.clipboard.writeText(result.composed_image_url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }, [result])

  const transformAttr = placement
    ? `translate(${placement.centerX} ${placement.centerY}) rotate(${radToDeg(placement.rotationRad)}) scale(${placement.scale})`
    : undefined
  const viewBox = `0 0 ${canvasSize.width} ${canvasSize.height}`
  const rotationDeg = placement ? radToDeg(placement.rotationRad) : 0
  const canRender = Boolean(selectedFile && placement && !saving && !loadingSpec)
  const placementJson = useMemo(() => placement ? JSON.stringify(placement, null, 2) : 'null', [placement])

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>印刷データ生成テスト</h1>

      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <select
          value={targetVariant}
          onChange={event => setTargetVariant(event.target.value)}
          style={{ padding: '8px 10px', maxWidth: 320 }}
        >
          {TARGETS.map(item => (
            <option key={item.variant} value={item.variant}>{item.label}</option>
          ))}
        </select>

        <div>
          <label style={{ display: 'inline-block', padding: '8px 12px', background: '#4f46e5', color: '#fff', borderRadius: 4, cursor: 'pointer' }}>
            <input type="file" accept="image/png,image/jpeg" onChange={onFile} style={{ display: 'none' }} />
            画像を選ぶ
          </label>
        </div>

        <span style={{ color: '#6b7280', fontSize: 13 }}>
          {Math.round(canvasSize.width)} x {Math.round(canvasSize.height)} px
        </span>
      </div>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      {loadingSpec && <p>Loading spec...</p>}

      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#f7f8fa' }}>
          <svg viewBox={viewBox} style={{ display: 'block', width: '100%', maxHeight: '72vh' }}>
            <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="#fff" />
            {previewUrl && placement && transformAttr && (
              <g transform={transformAttr}>
                <image
                  href={previewUrl}
                  x={-placement.imageWidth / 2}
                  y={-placement.imageHeight / 2}
                  width={placement.imageWidth}
                  height={placement.imageHeight}
                  preserveAspectRatio="none"
                />
              </g>
            )}
            {baseImageUrl && !baseImageLoadFailed && (
              <image
                href={baseImageUrl}
                x="0"
                y="0"
                width={canvasSize.width}
                height={canvasSize.height}
                preserveAspectRatio="none"
                opacity="0.72"
                onError={() => setBaseImageLoadFailed(true)}
              />
            )}
            {target.mode === 'legacy-pixel9a' && (
              <path
                d={PIXEL_9A_CASE_CLIP_PATH_D}
                fill="rgba(255,255,255,0.62)"
                stroke="rgba(0, 153, 255, 0.72)"
                strokeWidth="1.25"
                fillRule="evenodd"
                clipRule="evenodd"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="none" stroke="#111827" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <section style={{ display: 'grid', gap: 12 }}>
          <label>
            X: {Math.round((placement?.centerX ?? canvasSize.width / 2) * 100) / 100}
            <input
              type="range"
              min={-canvasSize.width}
              max={canvasSize.width * 2}
              step="1"
              value={placement?.centerX ?? canvasSize.width / 2}
              onChange={event => updatePlacement({ centerX: Number(event.target.value) })}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Y: {Math.round((placement?.centerY ?? canvasSize.height / 2) * 100) / 100}
            <input
              type="range"
              min={-canvasSize.height}
              max={canvasSize.height * 2}
              step="1"
              value={placement?.centerY ?? canvasSize.height / 2}
              onChange={event => updatePlacement({ centerY: Number(event.target.value) })}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Scale: {Math.round((placement?.scale ?? 1) * 100) / 100}
            <input
              type="range"
              min="0.1"
              max="4"
              step="0.01"
              value={placement?.scale ?? 1}
              onChange={event => updatePlacement({ scale: Number(event.target.value) })}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Rotation: {Math.round(rotationDeg * 100) / 100}°
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={rotationDeg}
              onChange={event => updatePlacement({ rotationRad: degToRad(Number(event.target.value)) })}
              style={{ width: '100%' }}
            />
          </label>

          <button
            type="button"
            onClick={onRender}
            disabled={!canRender}
            style={{ padding: '10px 12px', maxWidth: 240 }}
          >
            {saving ? '生成中' : '印刷データ生成'}
          </button>

          {result && (
            <div style={{ display: 'grid', gap: 8 }}>
              <strong>生成結果</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <a href={result.composed_image_url} target="_blank" rel="noreferrer">composed_image_url</a>
                <button type="button" onClick={copyResultUrl} style={{ padding: '6px 10px' }}>
                  URLコピー
                </button>
                {copyState === 'copied' && <span style={{ color: '#15803d' }}>copied</span>}
                {copyState === 'failed' && <span style={{ color: '#dc2626' }}>copy failed</span>}
              </div>
              <img src={result.composed_image_url} alt="生成された印刷データ" style={{ width: '100%', border: '1px solid #ddd' }} />
            </div>
          )}

          <details>
            <summary>Placement JSON</summary>
            <pre style={{ overflow: 'auto', background: '#f5f5f5', padding: 8, fontSize: 12 }}>{placementJson}</pre>
          </details>
        </section>
      </div>
    </main>
  )
}
