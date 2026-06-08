import { forwardRef, useId, useMemo } from 'react'
import type { TigersBackground, TigersLayout, TigersMockItem, TigersStamp } from './tigersTypes'
import { tigersClipProfile } from './tigersClipPaths'
import { patternTiles } from './tigersPattern'

type TigersDesignPreviewProps = {
  selectedStamps: TigersStamp[]
  selectedLayout: TigersLayout | null
  selectedBackground: TigersBackground | null
  selectedItem: TigersMockItem
  mode?: 'mockup' | 'print' | 'thumbnail'
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
  return patternTiles(stamp, designWidth, designHeight).map((tile, index) => (
    <image
      key={`pattern-${index}`}
      href={stamp.imagePath}
      x={tile.x}
      y={tile.y}
      width={tile.width}
      height={tile.height}
      preserveAspectRatio="xMidYMid meet"
    />
  ))
}

function rotatedBounds(width: number, height: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map(point => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }))

  return {
    minX: Math.min(...corners.map(point => point.x)),
    maxX: Math.max(...corners.map(point => point.x)),
    minY: Math.min(...corners.map(point => point.y)),
    maxY: Math.max(...corners.map(point => point.y)),
  }
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
  const angle = layout.stampAngles[index] ?? 0
  const rotation = rotatedBounds(width, height, angle)

  let x = alignment === 'bottomRight'
    ? slotX + slotWidth - width
    : slotX + (slotWidth - width) / 2
  let y = alignment === 'bottomRight'
    ? slotY + slotHeight - height
    : slotY + (slotHeight - height) / 2

  if (alignment === 'bottomRight' && angle !== 0) {
    // Flutter と同じ topLeft 回転だが、回転後 bbox が slot 内に収まるよう右下基準で補正
    x = slotX + slotWidth - rotation.maxX
    y = slotY + slotHeight - rotation.maxY
  }

  return {
    x,
    y,
    width,
    height,
    angle,
  }
}

export const TigersDesignPreview = forwardRef<SVGSVGElement, TigersDesignPreviewProps>(function TigersDesignPreview({
  selectedStamps,
  selectedLayout,
  selectedBackground,
  selectedItem,
  mode = 'mockup',
}, ref) {
  const uid = useId().replace(/:/g, '')
  const clip = useMemo(
    () => tigersClipProfile(selectedItem.caseKind, {
      commerceBaseImageUrl: selectedItem.commerceBaseImageUrl,
    }),
    [selectedItem.caseKind, selectedItem.commerceBaseImageUrl],
  )

  const activeStamps = selectedLayout ? selectedStamps.slice(0, selectedLayout.stampCount) : []
  const designWidth = clip.designArea.width
  const designHeight = clip.designArea.height
  const viewBoxWidth = clip.viewBox.width
  const viewBoxHeight = clip.viewBox.height
  const viewBox = `0 0 ${viewBoxWidth} ${viewBoxHeight}`
  const maskId = `tigers-mask-${uid}`
  const shadowId = `tigers-shadow-${uid}`
  const showBaseImage = (mode === 'mockup' || mode === 'thumbnail') && clip.baseImagePath !== null
  const showShadow = mode === 'mockup'
  const showCanvasBg = mode === 'mockup'

  return (
    <div className={`tigers-design-preview tigers-design-preview--${selectedItem.caseKind} tigers-design-preview--${mode}`}>
      <svg
        ref={ref}
        className="tigers-design-preview__case-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${selectedItem.modelName} ${selectedItem.materialName} プレビュー`}
      >
        <defs>
          {showShadow ? (
            <filter
              id={shadowId}
              x="-40"
              y="-40"
              width={viewBoxWidth + 80}
              height={viewBoxHeight + 100}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feDropShadow dx="-2" dy="-2" stdDeviation="6" floodColor="#000000" floodOpacity="0.06" />
              <feDropShadow dx="3" dy="6" stdDeviation="4" floodColor="#000000" floodOpacity="0.18" />
              <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#000000" floodOpacity="0.10" />
              <feDropShadow dx="2" dy="3" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.15" />
            </filter>
          ) : null}
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#000000" />
            <path d={clip.maskPathD} fill="#ffffff" fillRule={clip.fillRule} />
          </mask>
        </defs>

        {showCanvasBg ? (
          <rect
            className="tigers-design-preview__canvas-bg"
            x="0"
            y="0"
            width={viewBoxWidth}
            height={viewBoxHeight}
          />
        ) : null}

        {showShadow ? (
          <path
            className="tigers-design-preview__case-shadow"
            d={clip.outlinePathD}
            fillRule={clip.fillRule}
            filter={`url(#${shadowId})`}
          />
        ) : null}

        {showBaseImage && clip.baseImagePath ? (
          <image
            className="tigers-design-preview__base-image"
            href={clip.baseImagePath}
            x="0"
            y="0"
            width={viewBoxWidth}
            height={viewBoxHeight}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : mode === 'mockup' || mode === 'thumbnail' ? (
          <path
            className="tigers-design-preview__case-base"
            d={clip.outlinePathD}
            fillRule={clip.fillRule}
          />
        ) : null}

        <g mask={`url(#${maskId})`}>
          <g transform={`translate(${clip.designArea.x} ${clip.designArea.y})`}>
            {selectedItem.caseColor ? (
              <rect width={designWidth} height={designHeight} fill={selectedItem.caseColor} />
            ) : null}
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
        </g>

      </svg>
    </div>
  )
})
