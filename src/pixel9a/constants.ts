/**
 * Pixel 9a ハードケース SVG クリップ（Flutter `kPixel9aCaseClipSvgPathData` と同一）。
 * 外周＋カメラバー穴を含む複合パス。クリップは even-odd で穴を抜く。
 */
export const PIXEL_9A_CASE_CLIP_PATH_D =
  'M367.68,668.45h-136.57c-19.8,0-35.15-15.35-35.15-35.15v-370.63c0-19.8,15.35-35.15,35.15-35.15h136.57c19.8,0,35.15,15.35,35.15,35.15v370.63c0,19.8-15.35,35.15-35.15,35.15ZM242.84,272.22c-13.99,0-25.37,11.38-25.37,25.37s11.38,25.37,25.37,25.37h75.96c13.99,0,25.37-11.38,25.37-25.37s-11.38-25.37-25.37-25.37h-75.96Z' as const

/** Flutter `kPixel9aCaseClipHoleSvgPathData`（影・縁取り用）。 */
export const PIXEL_9A_CASE_CLIP_HOLE_PATH_D =
  'M242.84,272.22c-13.99,0-25.37,11.38-25.37,25.37s11.38,25.37,25.37,25.37h75.96c13.99,0,25.37-11.38,25.37-25.37s-11.38-25.37-25.37-25.37h-75.96Z' as const

/** Flutter `kPixel9aCaseClipSvgViewBoxWidth` / `Height`（参照・互換）。 */
export const PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX = {
  width: 574.08,
  height: 840.97,
} as const

/**
 * パース済み外周＋穴パスのバウンディング（Flutter `kPixel9aCaseClipPathBounds` に相当）。
 * `viewBox` をこの矩形にすると `BoxFit.contain` と同じ基準でフィットする。
 */
export const PIXEL_9A_CASE_CLIP_PATH_BOUNDS = {
  left: 195.96,
  top: 227.52,
  width: 206.87,
  height: 440.93,
} as const

export const PIXEL_9A_CASE_MASK_OUTER_BACKGROUND = '#ffffff'
