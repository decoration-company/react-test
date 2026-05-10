import type {
  TigersBackground,
  TigersBackgroundSurface,
  TigersLayout,
  TigersMockItem,
  TigersStamp,
} from './tigersTypes'
import { PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX } from '../pixel9a/constants'

const ASSET_BASE = '/assets/tigers'

function stamp(id: string, width: number, height: number, endSaleDate: string | null = null): TigersStamp {
  return {
    id,
    imagePath: `${ASSET_BASE}/tigers-stamp/tigers-stamp-${id.padStart(2, '0')}.png`,
    width,
    height,
    aspectRatio: width !== 0 && height !== 0 ? width / height : 1,
    endSaleDate,
  }
}

// 阪神タイガースコラボ商品専用素材。用途は阪神コラボ商品のカスタマイズに限定する。
export const tigersStamps: TigersStamp[] = [
  stamp('1', 831, 557),
  stamp('2', 844, 849),
  stamp('3', 841, 850),
  stamp('4', 849, 318),
  stamp('5', 852, 870),
  stamp('6', 859, 838),
  stamp('7', 852, 820),
  stamp('8', 862, 396),
  stamp('9', 860, 497),
  stamp('10', 858, 493),
  stamp('11', 874, 503),
  stamp('12', 858, 285),
  stamp('13', 852, 296),
  stamp('14', 797, 850, '2025-12-31T23:59:59+09:00'),
  stamp('15', 797, 850),
]

export function tigersStampsOnSale(now = new Date()): TigersStamp[] {
  return tigersStamps.filter(item => item.endSaleDate === null || now < new Date(item.endSaleDate))
}

function background(
  surface: TigersBackgroundSurface,
  id: string,
  name: string,
  fileName: string | null,
): TigersBackground {
  return {
    id,
    name,
    cssClass: `bg-${id}`,
    imagePath: fileName ? `${ASSET_BASE}/tigers-back/${fileName}` : null,
    surface,
  }
}

export const tigersSmartphoneCaseBackgrounds: TigersBackground[] = [
  background('smartphone', 'transparent', '透明', null),
  background('smartphone', 'case1', '黒', 'tigers_back_case1.png'),
  background('smartphone', 'case2', '黄色', 'tigers_back_case2.png'),
  background('smartphone', 'case3', '白ストライプ', 'tigers_back_case3.png'),
  background('smartphone', 'case4', '黄色×黒バイカラー', 'tigers_back_case4.png'),
  background('smartphone', 'case5', '黄色×黒ボーダー', 'tigers_back_case5.png'),
]

export const tigersDiaryCaseBackgrounds: TigersBackground[] = [
  background('diary', 'diary1', '黒', 'tigers_back_diary1.png'),
  background('diary', 'diary2', '黄色', 'tigers_back_diary2.png'),
  background('diary', 'diary3', '白ストライプ', 'tigers_back_diary3.png'),
  background('diary', 'diary4', '黄色×黒バイカラー', 'tigers_back_diary4.png'),
  background('diary', 'diary5', '黄色×黒ボーダー', 'tigers_back_diary5.png'),
]

export const tigersBackgrounds = [
  ...tigersSmartphoneCaseBackgrounds,
  ...tigersDiaryCaseBackgrounds,
]

export const activeTigersBackgroundSurface: TigersBackgroundSurface = 'smartphone'

export const visibleTigersBackgrounds = tigersBackgrounds.filter(
  item => item.surface === activeTigersBackgroundSurface,
)

export const tigersLayouts: TigersLayout[] = [
  {
    id: 'center',
    name: '中央スタンプ',
    stampCount: 1,
    stampAlignments: ['center'],
    stampSizeScales: [0.7],
    stampPositions: [{ top: 0, right: 0, bottom: 0, left: 0 }],
    stampAngles: [0],
  },
  {
    id: 'bottom-right',
    name: '右下ワンポイント',
    stampCount: 1,
    stampAlignments: ['bottomRight'],
    stampSizeScales: [0.45],
    stampPositions: [{ top: 0, right: 12, bottom: 2, left: 0 }],
    stampAngles: [-20],
  },
  {
    id: 'double',
    name: '中央＋右下ダブル',
    stampCount: 2,
    stampAlignments: ['center', 'bottomRight'],
    stampSizeScales: [0.7, 0.45],
    stampPositions: [
      { top: 0, right: 0, bottom: 0, left: 0 },
      { top: 0, right: 12, bottom: 2, left: 0 },
    ],
    stampAngles: [0, -20],
  },
  {
    id: 'pattern',
    name: 'パターン',
    stampCount: 1,
    stampAlignments: ['center'],
    stampSizeScales: [0.45],
    stampPositions: [{ top: 0, right: 0, bottom: 0, left: 0 }],
    stampAngles: [0],
  },
]

export const mockTigersItem: TigersMockItem = {
  variant: 'pixel-9a',
  modelName: 'Google Pixel 9a',
  materialName: 'ハードケース',
  colorName: 'ホワイト',
  price: 2980,
  caseColor: '#ffffff',
  printWidth: PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX.width,
  printHeight: PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX.height,
}
