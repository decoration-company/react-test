import type { TigersDesign } from './tigersTypes'

export type TigersSerializedDesign = {
  state: [
    {
      layout: string
      stamps: string
      background: string
      type: 'simpleDesign'
    },
  ]
}

export function serializeTigersDesign(design: TigersDesign): TigersSerializedDesign {
  return {
    state: [
      {
        layout: design.layout.id,
        stamps: design.stamps.map(stamp => stamp.id).join(','),
        background: design.background.id,
        type: 'simpleDesign',
      },
    ],
  }
}
