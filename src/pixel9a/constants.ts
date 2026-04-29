/**
 * Pixel 9a ハードケース SVG クリップ（`Google-Pixel9a.svg` と同一）。
 * 外周＋カメラバー穴を含む複合パス。クリップは even-odd で穴を抜く。
 */
export const PIXEL_9A_CASE_CLIP_PATH_D =
  'M172.22,441.43H35.65c-19.8,0-35.15-15.35-35.15-35.15V35.65C.5,15.85,15.85.5,35.65.5h136.57c19.8,0,35.15,15.35,35.15,35.15v370.63c0,19.8-15.35,35.15-35.15,35.15ZM47.38,45.2c-13.99,0-25.37,11.38-25.37,25.37s11.38,25.37,25.37,25.37h75.96c13.99,0,25.37-11.38,25.37-25.37s-11.38-25.37-25.37-25.37H47.38Z' as const

/** 外周パス（影用）。カメラバー穴を含めると内側と角の影が重く見えるため分ける。 */
export const PIXEL_9A_CASE_OUTER_PATH_D =
  'M172.22,441.43H35.65c-19.8,0-35.15-15.35-35.15-35.15V35.65C.5,15.85,15.85.5,35.65.5h136.57c19.8,0,35.15,15.35,35.15,35.15v370.63c0,19.8-15.35,35.15-35.15,35.15Z' as const

/** 穴パス（参照用）。 */
export const PIXEL_9A_CASE_CLIP_HOLE_PATH_D =
  'M47.38,45.2c-13.99,0-25.37,11.38-25.37,25.37s11.38,25.37,25.37,25.37h75.96c13.99,0,25.37-11.38,25.37-25.37s-11.38-25.37-25.37-25.37H47.38Z' as const

/** SVG viewBox（参照）。 */
export const PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX = {
  width: 207.87,
  height: 441.93,
} as const

/**
 * 外周＋穴パスのバウンディング。
 */
export const PIXEL_9A_CASE_CLIP_PATH_BOUNDS = {
  left: 0,
  top: 0,
  width: 207.87,
  height: 441.93,
} as const

export const PIXEL_9A_CASE_MASK_OUTER_BACKGROUND = '#f7f8fa'
