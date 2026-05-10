import { PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX } from '../pixel9a/constants'
import type { GarupanBackground, GarupanMockItem, GarupanStampResource } from './garupanTypes'

export const garupanStampResources: GarupanStampResource[] = [
  { id: 'miho', label: 'みほ', emoji: '🌸' },
  { id: 'tank', label: '戦車', emoji: '🛡️' },
  { id: 'school', label: '学園', emoji: '🏫' },
  { id: 'star', label: '星', emoji: '⭐' },
  { id: 'heart', label: 'ハート', emoji: '🧡' },
  { id: 'flag', label: 'フラッグ', emoji: '🚩' },
  { id: 'sparkle', label: 'きらめき', emoji: '✨' },
  { id: 'ribbon', label: 'リボン', emoji: '🎀' },
  { id: 'clover', label: 'クローバー', emoji: '🍀' },
  { id: 'music', label: '音符', emoji: '🎵' },
]

export const garupanBackgrounds: GarupanBackground[] = [
  { id: 'cream', label: 'クリーム', color: '#fff6e8' },
  { id: 'orange', label: 'オレンジ', color: '#f5a000' },
  { id: 'green', label: 'グリーン', color: '#b4cd78' },
  { id: 'blue', label: 'ブルー', color: '#d9efff' },
  { id: 'white', label: 'ホワイト', color: '#ffffff' },
  { id: 'pink', label: 'ピンク', color: '#ffe5ef' },
]

export const mockGarupanItem: GarupanMockItem = {
  variant: 'pixel-9a',
  modelName: 'Google Pixel 9a',
  materialName: 'ハードケース',
  colorName: 'ホワイト',
  price: 2980,
  printWidth: PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX.width,
  printHeight: PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX.height,
}
