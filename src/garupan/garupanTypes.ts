export type GarupanStampResource = {
  id: string
  label: string
  emoji: string
}

export type GarupanBackground = {
  id: string
  label: string
  color: string
}

export type GarupanPlacedStamp = {
  id: string
  resourceId: string
  emoji: string
  label: string
  x: number
  y: number
  size: number
  rotation: number
}

export type GarupanMockItem = {
  variant: string
  modelName: string
  materialName: string
  colorName: string
  price: number
  printWidth: number
  printHeight: number
}

export type GarupanDesign = {
  background: GarupanBackground
  stamps: GarupanPlacedStamp[]
}
