import type { CSSProperties } from 'react'
import type { TigersBackground, TigersLayout, TigersMockItem, TigersStamp } from './tigersTypes'

type TigersDesignPreviewProps = {
  selectedStamps: TigersStamp[]
  selectedLayout: TigersLayout | null
  selectedBackground: TigersBackground | null
  selectedItem: TigersMockItem
  mode?: 'mockup' | 'print'
}

const DESIGN_WIDTH = 166.8
const DESIGN_HEIGHT = 350.2

function stampSizeWithAspectRatio(stamp: TigersStamp): { width: number; height: number } {
  const oneSide = DESIGN_WIDTH / 3
  if (stamp.aspectRatio === 1) return { width: oneSide, height: oneSide }
  if (stamp.aspectRatio > 1) return { width: oneSide, height: oneSide / stamp.aspectRatio }
  return { width: oneSide * stamp.aspectRatio, height: oneSide }
}

function PatternStamp({ stamp }: { stamp: TigersStamp }) {
  const base = stampSizeWithAspectRatio(stamp)
  const sourceWidth = base.width * 0.8
  const sourceHeight = base.height * 0.8
  const gap = Math.max(sourceWidth, sourceHeight) * 1.1
  const columns = Math.ceil(DESIGN_WIDTH / gap) + 3
  const rows = Math.ceil(DESIGN_HEIGHT / gap) + 3

  return (
    <div className="tigers-design-preview__pattern">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((__, col) => (
          <img
            key={`${row}-${col}`}
            src={stamp.imagePath}
            alt=""
            style={{
              width: sourceWidth,
              height: sourceHeight,
              left: col * gap - gap,
              top: row * gap - gap,
            }}
          />
        )),
      )}
    </div>
  )
}

function alignmentClass(alignment: TigersLayout['stampAlignments'][number]): string {
  return alignment === 'bottomRight' ? 'is-bottom-right' : 'is-center'
}

function backgroundStyle(background: TigersBackground | null): CSSProperties {
  if (!background?.imagePath) return {}
  return { backgroundImage: `url(${background.imagePath})` }
}

export function TigersDesignPreview({
  selectedStamps,
  selectedLayout,
  selectedBackground,
  selectedItem,
  mode = 'mockup',
}: TigersDesignPreviewProps) {
  const activeStamps = selectedLayout ? selectedStamps.slice(0, selectedLayout.stampCount) : []

  return (
    <div className={`tigers-design-preview tigers-design-preview--${mode}`}>
      <div className="tigers-design-preview__phone-shell" aria-hidden="true">
        <div className="tigers-design-preview__camera" />
        <div className="tigers-design-preview__design-area">
          <div
            className="tigers-design-preview__case-color"
            style={{ backgroundColor: selectedItem.caseColor }}
          />
          <div className="tigers-design-preview__background" style={backgroundStyle(selectedBackground)} />
          {selectedLayout?.id === 'pattern' && activeStamps[0] ? (
            <PatternStamp stamp={activeStamps[0]} />
          ) : (
            activeStamps.map((stamp, index) => {
              const position = selectedLayout?.stampPositions[index] ?? { top: 0, right: 0, bottom: 0, left: 0 }
              const width = DESIGN_WIDTH * (selectedLayout?.stampSizeScales[index] ?? 0.7)
              const angle = selectedLayout?.stampAngles[index] ?? 0
              const alignment = selectedLayout?.stampAlignments[index] ?? 'center'

              return (
                <div
                  key={`${stamp.id}-${index}`}
                  className={`tigers-design-preview__stamp-slot ${alignmentClass(alignment)}`}
                  style={{
                    top: position.top,
                    right: position.right,
                    bottom: position.bottom,
                    left: position.left,
                  }}
                >
                  <img
                    src={stamp.imagePath}
                    alt=""
                    style={{
                      width,
                      transform: `rotate(${angle}deg)`,
                      transformOrigin: 'top left',
                    }}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
