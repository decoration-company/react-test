import type { TigersStamp } from './tigersTypes'

export function stampSizeWithAspectRatio(
  stamp: TigersStamp,
  designWidth: number,
): { width: number; height: number } {
  const oneSide = designWidth / 3
  if (stamp.aspectRatio === 1) return { width: oneSide, height: oneSide }
  if (stamp.aspectRatio > 1) return { width: oneSide, height: oneSide / stamp.aspectRatio }
  return { width: oneSide * stamp.aspectRatio, height: oneSide }
}

export type PatternTile = {
  x: number
  y: number
  width: number
  height: number
}

/** Flutter `PatternItemWidget` / プレビューと同じタイル配置。 */
export function patternTiles(
  stamp: TigersStamp,
  designWidth: number,
  designHeight: number,
): PatternTile[] {
  const base = stampSizeWithAspectRatio(stamp, designWidth)
  const sourceWidth = base.width * 0.8
  const sourceHeight = base.height * 0.8
  const gap = Math.max(sourceWidth, sourceHeight) * 1.1
  const baseOffsetX = -(sourceWidth * 0.42)
  const baseOffsetY = -(sourceHeight * 0.25)
  const maxX = designWidth * 1.5
  const maxY = designHeight * 1.5
  const rows = Math.ceil(maxY / gap)

  return Array.from({ length: rows }).flatMap((_, row) => {
    const startX = row % 2 === 0 ? 0 : gap
    const columns = Math.ceil((maxX - startX) / (gap * 2))

    return Array.from({ length: columns }).map((__, col) => ({
      x: baseOffsetX + startX + col * gap * 2,
      y: baseOffsetY + row * gap,
      width: sourceWidth,
      height: sourceHeight,
    }))
  })
}
