import { type ChangeEvent, useCallback, useEffect, useId, useState } from 'react'
import {
  PIXEL_9A_CASE_CLIP_PATH_BOUNDS,
  PIXEL_9A_CASE_CLIP_PATH_D,
  PIXEL_9A_CASE_CLIP_HOLE_PATH_D,
} from './constants'
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

function viewBoxAttr(): string {
  const b = PIXEL_9A_CASE_CLIP_PATH_BOUNDS
  return `${b.left} ${b.top} ${b.width} ${b.height}`
}

export function Pixel9aCaseMaskPreview() {
  const clipId = useId().replace(/:/g, '')
  const [imageHref, setImageHref] = useState<string>(PLACEHOLDER_DATA_URL)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  const onFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    const next = URL.createObjectURL(file)
    setObjectUrl(next)
    setImageHref(next)
    e.target.value = ''
  }, [objectUrl])

  const resetPlaceholder = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    setImageHref(PLACEHOLDER_DATA_URL)
  }, [objectUrl])

  const b = PIXEL_9A_CASE_CLIP_PATH_BOUNDS

  return (
    <section className="pixel9a-case-mask" aria-label="Pixel 9a ケースマスクプレビュー">
      <h1 className="pixel9a-case-mask__title">Pixel 9a（SVG マスク）</h1>
      <div className="pixel9a-case-mask__controls">
        <label className="pixel9a-case-mask__file">
          <input className="pixel9a-case-mask__file-input" type="file" accept="image/*" onChange={onFile} />
          画像を選ぶ
        </label>
        <button type="button" className="pixel9a-case-mask__reset" onClick={resetPlaceholder}>
          仮画像に戻す
        </button>
      </div>
      <div className="pixel9a-case-mask__stage">
        <svg
          className="pixel9a-case-mask__svg"
          viewBox={viewBoxAttr()}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="ケース形状でクリップされた画像"
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse" clipRule="evenodd">
              <path d={PIXEL_9A_CASE_CLIP_PATH_D} fillRule="evenodd" />
            </clipPath>
          </defs>
          <rect
            x={b.left}
            y={b.top}
            width={b.width}
            height={b.height}
            fill="var(--pixel9a-stage-bg, #e8e9ec)"
          />
          <g clipPath={`url(#${clipId})`}>
            <image
              href={imageHref}
              x={b.left}
              y={b.top}
              width={b.width}
              height={b.height}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
          <path
            d={PIXEL_9A_CASE_CLIP_PATH_D}
            fill="none"
            stroke="rgba(0,0,0,0.14)"
            strokeWidth={1.25}
            vectorEffect="nonScalingStroke"
          />
          <path
            d={PIXEL_9A_CASE_CLIP_HOLE_PATH_D}
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth={1}
            vectorEffect="nonScalingStroke"
          />
        </svg>
      </div>
    </section>
  )
}
