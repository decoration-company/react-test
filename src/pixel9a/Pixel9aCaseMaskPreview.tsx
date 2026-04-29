import { type ChangeEvent, useCallback, useEffect, useId, useState } from 'react'
import {
  PIXEL_9A_CASE_CLIP_PATH_BOUNDS,
  PIXEL_9A_CASE_CLIP_PATH_D,
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
  const shadowId = `${clipId}-shadow`
  const [imageHref, setImageHref] = useState<string | null>(PLACEHOLDER_DATA_URL)
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

  const showBlankCase = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    setImageHref(null)
  }, [objectUrl])

  const b = PIXEL_9A_CASE_CLIP_PATH_BOUNDS
  const imageBleed = 2

  return (
    <section className="pixel9a-case-mask" aria-label="Pixel 9a ケースマスクプレビュー">
      <h1 className="pixel9a-case-mask__title">Pixel 9a（SVG マスク）</h1>
      <div className="pixel9a-case-mask__controls">
        <label className="pixel9a-case-mask__file">
          <input className="pixel9a-case-mask__file-input" type="file" accept="image/*" onChange={onFile} />
          画像を選ぶ
        </label>
        <button type="button" className="pixel9a-case-mask__reset" onClick={showBlankCase}>
          無地（白）で見る
        </button>
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
                dx="-2"
                dy="-2"
                stdDeviation="12"
                floodColor="#000000"
                floodOpacity="0.06"
                result="ambient"
              />
              <feDropShadow
                in="SourceAlpha"
                dx="3"
                dy="6"
                stdDeviation="8"
                floodColor="#000000"
                floodOpacity="0.18"
                result="drop"
              />
              <feDropShadow
                in="SourceAlpha"
                dx="0"
                dy="8"
                stdDeviation="10"
                floodColor="#000000"
                floodOpacity="0.10"
                result="base"
              />
              <feDropShadow
                in="SourceAlpha"
                dx="2"
                dy="3"
                stdDeviation="3"
                floodColor="#000000"
                floodOpacity="0.15"
                result="contact"
              />
              <feMerge>
                <feMergeNode in="ambient" />
                <feMergeNode in="drop" />
                <feMergeNode in="base" />
                <feMergeNode in="contact" />
              </feMerge>
            </filter>
          </defs>
          <path d={PIXEL_9A_CASE_CLIP_PATH_D} fill="#000000" fillRule="evenodd" filter={`url(#${shadowId})`} />
          <path d={PIXEL_9A_CASE_CLIP_PATH_D} fill="#ffffff" fillRule="evenodd" />
          {imageHref ? (
            <g clipPath={`url(#${clipId})`}>
              <image
                href={imageHref}
                x={b.left - imageBleed}
                y={b.top - imageBleed}
                width={b.width + imageBleed * 2}
                height={b.height + imageBleed * 2}
                preserveAspectRatio="xMidYMid slice"
              />
            </g>
          ) : null}
        </svg>
      </div>
    </section>
  )
}
