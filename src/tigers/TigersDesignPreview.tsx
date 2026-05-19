import { forwardRef } from 'react'
import { PIXEL_9A_CASE_CLIP_PATH_D } from '../pixel9a/constants'
import type { TigersBackground, TigersLayout, TigersMockItem, TigersStamp } from './tigersTypes'

type TigersDesignPreviewProps = {
  selectedStamps: TigersStamp[]
  selectedLayout: TigersLayout | null
  selectedBackground: TigersBackground | null
  selectedItem: TigersMockItem
  mode?: 'mockup' | 'print'
}

function stampSizeWithAspectRatio(
  stamp: TigersStamp,
  designWidth: number,
): { width: number; height: number } {
  const oneSide = designWidth / 3
  if (stamp.aspectRatio === 1) return { width: oneSide, height: oneSide }
  if (stamp.aspectRatio > 1) return { width: oneSide, height: oneSide / stamp.aspectRatio }
  return { width: oneSide * stamp.aspectRatio, height: oneSide }
}

function PatternStamp({
  stamp,
  designWidth,
  designHeight,
}: {
  stamp: TigersStamp
  designWidth: number
  designHeight: number
}) {
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

    return Array.from({ length: columns }).map((__, col) => (
      <image
        key={`${row}-${col}`}
        href={stamp.imagePath}
        x={baseOffsetX + startX + col * gap * 2}
        y={baseOffsetY + row * gap}
        width={sourceWidth}
        height={sourceHeight}
        preserveAspectRatio="xMidYMid meet"
      />
    ))
  })
}

function stampRect({
  stamp,
  layout,
  index,
  designWidth,
  designHeight,
}: {
  stamp: TigersStamp
  layout: TigersLayout
  index: number
  designWidth: number
  designHeight: number
}) {
  const position = layout.stampPositions[index] ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const slotX = position.left
  const slotY = position.top
  const slotWidth = designWidth - position.left - position.right
  const slotHeight = designHeight - position.top - position.bottom
  const width = designWidth * (layout.stampSizeScales[index] ?? 0.7)
  const height = width / stamp.aspectRatio
  const alignment = layout.stampAlignments[index] ?? 'center'
  const x = alignment === 'bottomRight' ? slotX + slotWidth - width : slotX + (slotWidth - width) / 2
  const y = alignment === 'bottomRight' ? slotY + slotHeight - height : slotY + (slotHeight - height) / 2

  return {
    x,
    y,
    width,
    height,
    angle: layout.stampAngles[index] ?? 0,
  }
}

export const TigersDesignPreview = forwardRef<SVGSVGElement, TigersDesignPreviewProps>(function TigersDesignPreview({
  selectedStamps,
  selectedLayout,
  selectedBackground,
  selectedItem,
  mode = 'mockup',
}, ref) {
  const activeStamps = selectedLayout ? selectedStamps.slice(0, selectedLayout.stampCount) : []
  const designWidth = selectedItem.printWidth
  const designHeight = selectedItem.printHeight
  const viewBox = `0 0 ${designWidth} ${designHeight}`
  const maskId = 'tigers-pixel9a-mask'
  const shadowId = 'tigers-pixel9a-shadow'

  return (
    <div className={`tigers-design-preview tigers-design-preview--${mode}`}>
      <svg
        ref={ref}
        className="tigers-design-preview__pixel9a-svg"
        viewBox={viewBox}
        role="img"
        aria-label={`${selectedItem.modelName} ${selectedItem.materialName} プレビュー`}
      >
        <defs>
          <filter
            id={shadowId}
            x="-40"
            y="-40"
            width={designWidth + 80}
            height={designHeight + 100}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow dx="-2" dy="-2" stdDeviation="6" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="3" dy="6" stdDeviation="4" floodColor="#000000" floodOpacity="0.18" />
            <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#000000" floodOpacity="0.10" />
            <feDropShadow dx="2" dy="3" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.15" />
          </filter>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width={designWidth} height={designHeight} fill="#000000" />
            <path d={PIXEL_9A_CASE_CLIP_PATH_D} fill="#ffffff" fillRule="evenodd" />
          </mask>
        </defs>
        {mode === 'mockup' ? (
          <path
            className="tigers-design-preview__pixel9a-shadow"
            d={PIXEL_9A_CASE_CLIP_PATH_D}
            fillRule="evenodd"
            filter={`url(#${shadowId})`}
          />
        ) : null}
        <path
          className="tigers-design-preview__pixel9a-base"
          d={PIXEL_9A_CASE_CLIP_PATH_D}
          fillRule="evenodd"
        />
        <g mask={`url(#${maskId})`}>
          <rect width={designWidth} height={designHeight} fill={selectedItem.caseColor} />
          {selectedBackground?.imagePath ? (
            <image
              href={selectedBackground.imagePath}
              x="0"
              y="0"
              width={designWidth}
              height={designHeight}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : null}
          {selectedLayout?.id === 'pattern' && activeStamps[0] ? (
            <PatternStamp stamp={activeStamps[0]} designWidth={designWidth} designHeight={designHeight} />
          ) : (
            activeStamps.map((stamp, index) => {
              if (!selectedLayout) return null
              const rect = stampRect({ stamp, layout: selectedLayout, index, designWidth, designHeight })

              return (
                <image
                  key={`${stamp.id}-${index}`}
                  href={stamp.imagePath}
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  preserveAspectRatio="xMidYMid meet"
                  transform={`rotate(${rect.angle} ${rect.x} ${rect.y})`}
                />
              )
            })
          )}
        </g>
        <path
          className="tigers-design-preview__pixel9a-outline"
          d={PIXEL_9A_CASE_CLIP_PATH_D}
          fillRule="evenodd"
        />
      </svg>
    </div>
  )
})
