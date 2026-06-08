import {
  PIXEL_9A_CASE_CLIP_PATH_D,
  PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX,
} from '../pixel9a/constants'
import type { TigersCaseKind } from './tigersTypes'

/** `iphone-16-pro-kisekae_clip.svg` #bleed_area — 筐体シルエット。 */
export const KISEKAE_BLEED_AREA_PATH_D =
  'M440.48,855c34.61,0,62.76-28.15,62.76-62.76V147.76c0-34.6-28.15-62.76-62.76-62.76h-62.26c-8.06,0-14.65,3.83-17.21,9.99-2.73,6.6-.48,14.21,6.18,20.87,8.06,8.06,12.15,22.06,12.15,41.61v100.35c0,42.55-34.61,77.16-77.16,77.16h-92.34c-13.64,0-27.06-3.65-38.82-10.56l-1.06-.61c-1.12-.64-2.17-1.25-4.43-2.73-4.21-3.36-8.76-5.13-13.17-5.13s-8.69,1.89-11.59,5.31c-3.29,3.88-4.62,9.2-3.76,15v455.98c0,34.61,28.15,62.76,62.76,62.76h240.7Z' as const

/** `iphone-16-pro-kisekae_clip.svg` #print_area — デザインクリップ。 */
export const KISEKAE_PRINT_AREA_PATH_D =
  'M209.85,340.13h92.34c45.27,0,82.31-37.04,82.31-82.31v-100.35c0-16.68-2.76-34.35-13.66-45.24-10.98-10.98-5.1-22.08,7.39-22.08h62.26c31.69,0,57.61,25.93,57.61,57.61v644.48c0,31.69-25.93,57.61-57.61,57.61h-240.7c-31.69,0-57.61-25.93-57.61-57.61v-456.38c-2.06-12.35,8.89-19.92,20.34-10.63,3.22,2.13,4.25,2.64,5.92,3.62,12.19,7.16,26.35,11.27,41.43,11.27Z' as const

export const KISEKAE_CLIP_VIEW_BOX = {
  width: 640,
  height: 940,
} as const

export type TigersClipProfile = {
  viewBox: { width: number; height: number }
  /** モックアップの影・筐体シルエット。 */
  outlinePathD: string
  /** スタンプ / 背景のマスク。 */
  maskPathD: string
  fillRule: 'evenodd' | 'nonzero'
  /** 店頭合成用 base PNG（ローカル or commerce URL）。 */
  baseImagePath: string | null
}

export function tigersClipProfile(caseKind: TigersCaseKind): TigersClipProfile {
  if (caseKind === 'kisekae-face') {
    return {
      viewBox: KISEKAE_CLIP_VIEW_BOX,
      outlinePathD: KISEKAE_BLEED_AREA_PATH_D,
      maskPathD: KISEKAE_PRINT_AREA_PATH_D,
      fillRule: 'nonzero',
      baseImagePath: '/assets/iphone-16-pro/kisekae/iphone-16-pro-kisekae_base.png',
    }
  }

  return {
    viewBox: PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX,
    outlinePathD: PIXEL_9A_CASE_CLIP_PATH_D,
    maskPathD: PIXEL_9A_CASE_CLIP_PATH_D,
    fillRule: 'evenodd',
    baseImagePath: null,
  }
}
