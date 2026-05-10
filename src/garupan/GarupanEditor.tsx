import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { PIXEL_9A_CASE_CLIP_PATH_D } from '../pixel9a/constants'
import { garupanBackgrounds, garupanStampResources, mockGarupanItem } from './garupanData'
import { serializeGarupanDesign } from './garupanDesignSerialization'
import type { GarupanBackground, GarupanMockItem, GarupanPlacedStamp, GarupanStampResource } from './garupanTypes'
import './GarupanEditor.css'

type SheetMode = 'gallery' | 'background' | 'garupan' | 'stamp' | null

type DragState = {
  id: string
  pointerId: number
  startPoint: DOMPoint
  startX: number
  startY: number
}

function currency(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value)
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): DOMPoint {
  const point = new DOMPoint(clientX, clientY)
  const matrix = svg.getScreenCTM()
  if (!matrix) {
    const rect = svg.getBoundingClientRect()
    const viewBox = svg.viewBox.baseVal
    return new DOMPoint(
      ((clientX - rect.left) / rect.width) * viewBox.width,
      ((clientY - rect.top) / rect.height) * viewBox.height,
    )
  }
  return point.matrixTransform(matrix.inverse())
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function makePlacedStamp(
  resource: GarupanStampResource,
  item: GarupanMockItem,
  index: number,
): GarupanPlacedStamp {
  return {
    id: `${resource.id}-${Date.now()}-${index}`,
    resourceId: resource.id,
    emoji: resource.emoji,
    label: resource.label,
    x: item.printWidth * 0.5 + index * 12,
    y: item.printHeight * 0.46 + index * 12,
    size: 54,
    rotation: 0,
  }
}

function AppBar({
  item,
  onPreview,
}: {
  item: GarupanMockItem
  onPreview: () => void
}) {
  return (
    <header className="garupan-appbar">
      <div>
        <p>ガールズ＆パンツァー もっとらぶらぶ作戦です！</p>
        <h1>{item.modelName}</h1>
      </div>
      <button type="button" className="garupan-primary-button" onClick={onPreview}>
        プレビュー
      </button>
    </header>
  )
}

function GarupanCanvas({
  item,
  background,
  stamps,
  selectedStampId,
  onSelectStamp,
  onMoveStamp,
}: {
  item: GarupanMockItem
  background: GarupanBackground
  stamps: GarupanPlacedStamp[]
  selectedStampId: string | null
  onSelectStamp: (id: string | null) => void
  onMoveStamp: (id: string, x: number, y: number) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const viewBox = `0 0 ${item.printWidth} ${item.printHeight}`

  function startDrag(event: PointerEvent<SVGGElement>, stamp: GarupanPlacedStamp) {
    const svg = svgRef.current
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
    onSelectStamp(stamp.id)
    dragRef.current = {
      id: stamp.id,
      pointerId: event.pointerId,
      startPoint: clientToSvg(svg, event.clientX, event.clientY),
      startX: stamp.x,
      startY: stamp.y,
    }
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    const drag = dragRef.current
    if (!svg || !drag || drag.pointerId !== event.pointerId) return
    const current = clientToSvg(svg, event.clientX, event.clientY)
    onMoveStamp(
      drag.id,
      clamp(drag.startX + current.x - drag.startPoint.x, 0, item.printWidth),
      clamp(drag.startY + current.y - drag.startPoint.y, 0, item.printHeight),
    )
  }

  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div className="garupan-canvas-wrap">
      <svg
        ref={svgRef}
        className="garupan-canvas"
        viewBox={viewBox}
        role="img"
        aria-label={`${item.modelName} ガルパン自由レイアウト`}
        onPointerDown={() => onSelectStamp(null)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <clipPath id="garupan-pixel9a-clip" clipPathUnits="userSpaceOnUse">
            <path d={PIXEL_9A_CASE_CLIP_PATH_D} clipRule="evenodd" />
          </clipPath>
        </defs>
        <path className="garupan-canvas__base" d={PIXEL_9A_CASE_CLIP_PATH_D} fillRule="evenodd" />
        <g clipPath="url(#garupan-pixel9a-clip)">
          <rect width={item.printWidth} height={item.printHeight} fill={background.color} />
          <circle cx="42" cy="128" r="96" fill="#ffffff" opacity="0.28" />
          <circle cx="168" cy="338" r="118" fill="#ffffff" opacity="0.18" />
          {stamps.map(stamp => {
            const selected = stamp.id === selectedStampId
            return (
              <g
                key={stamp.id}
                className={`garupan-stamp-node ${selected ? 'is-selected' : ''}`}
                transform={`translate(${stamp.x} ${stamp.y}) rotate(${stamp.rotation})`}
                onPointerDown={event => startDrag(event, stamp)}
              >
                {selected ? (
                  <rect
                    x={-stamp.size / 2 - 6}
                    y={-stamp.size / 2 - 6}
                    width={stamp.size + 12}
                    height={stamp.size + 12}
                    rx="10"
                  />
                ) : null}
                <text
                  dominantBaseline="central"
                  textAnchor="middle"
                  fontSize={stamp.size}
                  aria-label={stamp.label}
                >
                  {stamp.emoji}
                </text>
              </g>
            )
          })}
        </g>
        <path className="garupan-canvas__outline" d={PIXEL_9A_CASE_CLIP_PATH_D} fillRule="evenodd" />
      </svg>
    </div>
  )
}

function ToolPanel({
  selectedStamp,
  onScale,
  onRotate,
  onDuplicate,
  onDelete,
}: {
  selectedStamp: GarupanPlacedStamp | null
  onScale: (size: number) => void
  onRotate: (rotation: number) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <aside className="garupan-tool-panel">
      {selectedStamp ? (
        <>
          <div className="garupan-tool-panel__title">
            <span>{selectedStamp.emoji}</span>
            <strong>{selectedStamp.label}</strong>
          </div>
          <label>
            サイズ
            <input
              type="range"
              min="28"
              max="112"
              value={selectedStamp.size}
              onChange={event => onScale(Number(event.target.value))}
            />
          </label>
          <label>
            回転
            <input
              type="range"
              min="-180"
              max="180"
              value={selectedStamp.rotation}
              onChange={event => onRotate(Number(event.target.value))}
            />
          </label>
          <div className="garupan-tool-panel__actions">
            <button type="button" onClick={onDuplicate}>複製</button>
            <button type="button" className="is-danger" onClick={onDelete}>削除</button>
          </div>
        </>
      ) : (
        <p>スタンプを選ぶと、サイズや角度を調整できます。</p>
      )}
    </aside>
  )
}

function BottomMenu({
  activeSheet,
  onOpen,
}: {
  activeSheet: SheetMode
  onOpen: (mode: SheetMode) => void
}) {
  const items: Array<{ mode: SheetMode; icon: string; label: string }> = [
    { mode: 'gallery', icon: '▦', label: 'ギャラリー' },
    { mode: 'background', icon: '▧', label: '背景' },
    { mode: 'garupan', icon: '○', label: 'ガルパン' },
    { mode: 'stamp', icon: '☆', label: 'スタンプ' },
  ]

  return (
    <nav className="garupan-bottom-menu" aria-label="編集メニュー">
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          className={activeSheet === item.mode ? 'is-active' : ''}
          onClick={() => onOpen(activeSheet === item.mode ? null : item.mode)}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

function Sheet({
  mode,
  background,
  onClose,
  onAddStamp,
  onSetBackground,
}: {
  mode: SheetMode
  background: GarupanBackground
  onClose: () => void
  onAddStamp: (resource: GarupanStampResource) => void
  onSetBackground: (background: GarupanBackground) => void
}) {
  if (!mode) return null

  if (mode === 'background') {
    return (
      <section className="garupan-sheet">
        <header>
          <h2>背景</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">×</button>
        </header>
        <p className="garupan-sheet__caption">背景カラー</p>
        <div className="garupan-background-grid">
          {garupanBackgrounds.map(item => (
            <button
              key={item.id}
              type="button"
              className={background.id === item.id ? 'is-selected' : ''}
              onClick={() => onSetBackground(item)}
            >
              <span style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      </section>
    )
  }

  if (mode === 'gallery') {
    return (
      <section className="garupan-sheet">
        <header>
          <h2>ギャラリー</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">×</button>
        </header>
        <div className="garupan-template-grid">
          {[
            ['テンプレA', '🌸 🛡️ ⭐'],
            ['テンプレB', '🎀 ✨ 🍀'],
            ['テンプレC', '🚩 🏫 🎵'],
          ].map(([label, sample]) => (
            <button key={label} type="button">
              <span>{sample}</span>
              {label}
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="garupan-sheet">
      <header>
        <h2>{mode === 'garupan' ? 'ガルパン' : 'スタンプ'}</h2>
        <button type="button" onClick={onClose} aria-label="閉じる">×</button>
      </header>
      <p className="garupan-sheet__caption">
        {mode === 'garupan' ? 'ダミー素材をタップして追加' : '色が変わるスタンプ（仮）'}
      </p>
      <div className="garupan-stamp-grid">
        {garupanStampResources.map(resource => (
          <button key={resource.id} type="button" onClick={() => onAddStamp(resource)}>
            <span>{resource.emoji}</span>
            {resource.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function PreviewScreen({
  item,
  background,
  stamps,
  onBack,
}: {
  item: GarupanMockItem
  background: GarupanBackground
  stamps: GarupanPlacedStamp[]
  onBack: () => void
}) {
  function save() {
    const specId = `spec_dev_${Date.now()}`
    const designData = serializeGarupanDesign({ background, stamps })
    window.parent?.postMessage({
      type: 'decocom:design:ready',
      variant: item.variant,
      spec_id: specId,
      design_data: designData,
      preview_url: null,
      print_image_url: null,
    }, '*')
    console.log('[garupan-editor] saved mock design', {
      spec_id: specId,
      variant: item.variant,
      design_data: designData,
    })
  }

  return (
    <section className="garupan-preview-page">
      <header className="garupan-appbar">
        <button type="button" className="garupan-back-button" onClick={onBack}>‹</button>
        <div>
          <p>プレビュー</p>
          <h1>ガルパン自由レイアウト</h1>
        </div>
        <span />
      </header>
      <div className="garupan-preview-page__body">
        <GarupanCanvas
          item={item}
          background={background}
          stamps={stamps}
          selectedStampId={null}
          onSelectStamp={() => {}}
          onMoveStamp={() => {}}
        />
        <div className="garupan-preview-card">
          <h2>ガルパンコラボ</h2>
          <p>機種: {item.modelName}</p>
          <p>素材: {item.materialName}</p>
          <p>カラー: {item.colorName}</p>
          <p>価格: ¥{currency(item.price)}</p>
          <p>スタンプ数: {stamps.length}</p>
        </div>
      </div>
      <footer className="garupan-preview-page__footer">
        <button type="button" className="garupan-primary-button" onClick={save}>
          カートに入れる
        </button>
      </footer>
    </section>
  )
}

export function GarupanEditor({ variant }: { variant: string | null }) {
  const item = useMemo<GarupanMockItem>(() => ({
    ...mockGarupanItem,
    variant: variant?.trim() || mockGarupanItem.variant,
  }), [variant])

  const [background, setBackground] = useState<GarupanBackground>(garupanBackgrounds[0])
  const [stamps, setStamps] = useState<GarupanPlacedStamp[]>([])
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null)
  const [activeSheet, setActiveSheet] = useState<SheetMode>('gallery')
  const [isPreview, setIsPreview] = useState(false)

  const selectedStamp = stamps.find(stamp => stamp.id === selectedStampId) ?? null

  useEffect(() => {
    document.body.classList.add('garupan-editor-body')
    return () => document.body.classList.remove('garupan-editor-body')
  }, [])

  function addStamp(resource: GarupanStampResource) {
    setStamps(prev => {
      const nextStamp = makePlacedStamp(resource, item, prev.length)
      setSelectedStampId(nextStamp.id)
      return [...prev, nextStamp]
    })
  }

  function updateStamp(id: string, patch: Partial<GarupanPlacedStamp>) {
    setStamps(prev => prev.map(stamp => (stamp.id === id ? { ...stamp, ...patch } : stamp)))
  }

  function duplicateSelectedStamp() {
    if (!selectedStamp) return
    const duplicate = {
      ...selectedStamp,
      id: `${selectedStamp.resourceId}-${Date.now()}`,
      x: clamp(selectedStamp.x + 16, 0, item.printWidth),
      y: clamp(selectedStamp.y + 16, 0, item.printHeight),
    }
    setStamps(prev => [...prev, duplicate])
    setSelectedStampId(duplicate.id)
  }

  function deleteSelectedStamp() {
    if (!selectedStamp) return
    setStamps(prev => prev.filter(stamp => stamp.id !== selectedStamp.id))
    setSelectedStampId(null)
  }

  if (isPreview) {
    return (
      <PreviewScreen
        item={item}
        background={background}
        stamps={stamps}
        onBack={() => setIsPreview(false)}
      />
    )
  }

  return (
    <section className="garupan-editor">
      <AppBar item={item} onPreview={() => setIsPreview(true)} />
      <main className="garupan-editor__main">
        <div className="garupan-editor__stage">
          <GarupanCanvas
            item={item}
            background={background}
            stamps={stamps}
            selectedStampId={selectedStampId}
            onSelectStamp={setSelectedStampId}
            onMoveStamp={(id, x, y) => updateStamp(id, { x, y })}
          />
        </div>
        <ToolPanel
          selectedStamp={selectedStamp}
          onScale={size => selectedStamp && updateStamp(selectedStamp.id, { size })}
          onRotate={rotation => selectedStamp && updateStamp(selectedStamp.id, { rotation })}
          onDuplicate={duplicateSelectedStamp}
          onDelete={deleteSelectedStamp}
        />
      </main>
      <Sheet
        mode={activeSheet}
        background={background}
        onClose={() => setActiveSheet(null)}
        onAddStamp={addStamp}
        onSetBackground={setBackground}
      />
      <BottomMenu activeSheet={activeSheet} onOpen={setActiveSheet} />
    </section>
  )
}
