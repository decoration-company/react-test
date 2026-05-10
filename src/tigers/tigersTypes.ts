export type TigersStep = 'stamp' | 'layout' | 'background' | 'preview'

export type TigersStamp = {
  id: string
  imagePath: string
  width: number
  height: number
  aspectRatio: number
  endSaleDate: string | null
}

export type TigersBackgroundSurface = 'smartphone' | 'diary'

export type TigersBackground = {
  id: string
  name: string
  cssClass: string
  imagePath: string | null
  surface: TigersBackgroundSurface
}

export type TigersAlignment = 'center' | 'bottomRight'

export type TigersStampPosition = {
  top: number
  right: number
  bottom: number
  left: number
}

export type TigersLayout = {
  id: 'center' | 'bottom-right' | 'double' | 'pattern'
  name: string
  stampCount: number
  stampAlignments: TigersAlignment[]
  stampSizeScales: number[]
  stampPositions: TigersStampPosition[]
  stampAngles: number[]
}

export type TigersDesign = {
  layout: TigersLayout
  stamps: TigersStamp[]
  background: TigersBackground
}

export type TigersMockItem = {
  variant: string
  modelName: string
  materialName: string
  colorName: string
  price: number
  caseColor: string
}
