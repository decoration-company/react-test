import type { GarupanDesign } from './garupanTypes'

export type GarupanSerializedDesign = {
  state: Array<{
    type: 'freeDesign'
    background: string
    stamps: Array<{
      resourceId: string
      x: number
      y: number
      size: number
      rotation: number
    }>
  }>
}

export function serializeGarupanDesign(design: GarupanDesign): GarupanSerializedDesign {
  return {
    state: [
      {
        type: 'freeDesign',
        background: design.background.id,
        stamps: design.stamps.map(stamp => ({
          resourceId: stamp.resourceId,
          x: Math.round(stamp.x * 100) / 100,
          y: Math.round(stamp.y * 100) / 100,
          size: Math.round(stamp.size * 100) / 100,
          rotation: Math.round(stamp.rotation * 100) / 100,
        })),
      },
    ],
  }
}
