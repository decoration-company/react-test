import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { uploadImage, saveDesign } from '../api/commerce'
import { svgElementToPngFile } from '../api/svgExport'
import { PIXEL_9A_CASE_CLIP_PATH_D } from '../pixel9a/constants'
import { garupanBackgrounds, garupanStampResources, mockGarupanItem } from './garupanData'
import { serializeGarupanDesign } from './garupanDesignSerialization'
import type { GarupanBackground, GarupanMockItem, GarupanPlacedStamp, GarupanStampResource } from './garupanTypes'
import './GarupanEditor.css'

function embeddedParentOrigin(): string {
  const params = new URLSearchParams(window.location.search)
  const origin = params.get('origin') ?? params.get('parent_origin') ?? '*'
  if (origin === '*') return origin
  try {
    return new URL(origin).origin
  } catch {
    return '*'
  }
}

function isShopifyEmbed(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('embed') === 'shopify' || params.get('platform') === 'shopify'
}

type SheetMode = 'gallery' | 'background' | 'garupan' | 'stamp' | null

type DragState = {
  id: string
  pointerId: number
  startPoint: DOMPoint
  startX: number
  startY: number
}

type ScaleState = {
  id: string
  pointerId: number
}

type RotateState = {
  id: string
  pointerId: number
}

type GestureState =
  | ({ kind: 'move' } & DragState)
  | ({ kind: 'scale' } & ScaleState)
  | ({ kind: 'rotate' } & RotateState)

const SELECTED_BORDER_COLOR = '#12CDD7'
const SELECTED_BORDER_WIDTH = 3
const HANDLE_SIZE = 20
const HANDLE_ICON_SIZE = 14
const STAMP_MIN_SIZE = 28
const STAMP_MAX_SIZE = 112

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
  onScaleStamp,
  onRotateStamp,
  onDeleteStamp,
}: {
  item: GarupanMockItem
  background: GarupanBackground
  stamps: GarupanPlacedStamp[]
  selectedStampId: string | null
  onSelectStamp: (id: string | null) => void
  onMoveStamp: (id: string, x: number, y: number) => void
  onScaleStamp: (id: string, size: number) => void
  onRotateStamp: (id: string, rotation: number) => void
  onDeleteStamp: (id: string) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const gestureRef = useRef<GestureState | null>(null)
  const viewBox = `0 0 ${item.printWidth} ${item.printHeight}`

  function startDrag(event: PointerEvent<SVGGElement>, stamp: GarupanPlacedStamp) {
    const svg = svgRef.current
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
    onSelectStamp(stamp.id)
    gestureRef.current = {
      kind: 'move',
      id: stamp.id,
      pointerId: event.pointerId,
      startPoint: clientToSvg(svg, event.clientX, event.clientY),
      startX: stamp.x,
      startY: stamp.y,
    }
  }

  function startScale(event: PointerEvent<SVGGElement>, stamp: GarupanPlacedStamp) {
    const svg = svgRef.current
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
    onSelectStamp(stamp.id)
    gestureRef.current = {
      kind: 'scale',
      id: stamp.id,
      pointerId: event.pointerId,
    }
  }

  function startRotate(event: PointerEvent<SVGGElement>, stamp: GarupanPlacedStamp) {
    const svg = svgRef.current
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
    onSelectStamp(stamp.id)
    gestureRef.current = {
      kind: 'rotate',
      id: stamp.id,
      pointerId: event.pointerId,
    }
  }

  function moveGesture(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    const gesture = gestureRef.current
    if (!svg || !gesture || gesture.pointerId !== event.pointerId) return
    const current = clientToSvg(svg, event.clientX, event.clientY)
    const stamp = stamps.find(candidate => candidate.id === gesture.id)
    if (!stamp) return

    if (gesture.kind === 'move') {
      onMoveStamp(
        gesture.id,
        clamp(gesture.startX + current.x - gesture.startPoint.x, 0, item.printWidth),
        clamp(gesture.startY + current.y - gesture.startPoint.y, 0, item.printHeight),
      )
      return
    }

    if (gesture.kind === 'scale') {
      const topLeft = rotatePoint(
        { x: stamp.x, y: stamp.y },
        { x: stamp.x - stamp.size / 2, y: stamp.y - stamp.size / 2 },
        stamp.rotation,
      )
      const distance = Math.hypot(current.x - topLeft.x, current.y - topLeft.y)
      onScaleStamp(gesture.id, clamp(distance / Math.SQRT2, STAMP_MIN_SIZE, STAMP_MAX_SIZE))
      return
    }

    const baseAngle = Math.atan2(-stamp.size / 2, stamp.size / 2)
    const currentAngle = Math.atan2(current.y - stamp.y, current.x - stamp.x)
    onRotateStamp(gesture.id, normalizeDegrees(((currentAngle - baseAngle) * 180) / Math.PI))
  }

  function endGesture(event: PointerEvent<SVGSVGElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null
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
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
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
            const half = stamp.size / 2
            const handleOffset = HANDLE_SIZE / 2
            return (
              <g
                key={stamp.id}
                className={`garupan-stamp-node ${selected ? 'is-selected' : ''}`}
                transform={`translate(${stamp.x} ${stamp.y}) rotate(${stamp.rotation})`}
                onPointerDown={event => startDrag(event, stamp)}
              >
                {selected ? (
                  <g className="garupan-selection-box" aria-hidden="true">
                    <rect
                      x={-half}
                      y={-half}
                      width={stamp.size}
                      height={stamp.size}
                      fill="none"
                      stroke={SELECTED_BORDER_COLOR}
                      strokeWidth={SELECTED_BORDER_WIDTH}
                      vectorEffect="non-scaling-stroke"
                    />
                    <g
                      className="garupan-edit-handle"
                      transform={`translate(${-half - handleOffset} ${-half - handleOffset})`}
                      onPointerDown={event => {
                        event.stopPropagation()
                        onDeleteStamp(stamp.id)
                      }}
                    >
                      <circle r={HANDLE_SIZE / 2} />
                      <text dominantBaseline="central" textAnchor="middle" fontSize={HANDLE_ICON_SIZE}>×</text>
                    </g>
                    <g
                      className="garupan-edit-handle is-rotate"
                      transform={`translate(${half + handleOffset} ${-half - handleOffset})`}
                      onPointerDown={event => startRotate(event, stamp)}
                    >
                      <circle r={HANDLE_SIZE / 2} />
                      <text dominantBaseline="central" textAnchor="middle" fontSize={HANDLE_ICON_SIZE}>↻</text>
                    </g>
                    <g
                      className="garupan-edit-handle is-scale"
                      transform={`translate(${half + handleOffset} ${half + handleOffset})`}
                      onPointerDown={event => startScale(event, stamp)}
                    >
                      <circle r={HANDLE_SIZE / 2} />
                      <text dominantBaseline="central" textAnchor="middle" fontSize={HANDLE_ICON_SIZE}>↘</text>
                    </g>
                  </g>
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

function rotatePoint(
  center: { x: number; y: number },
  point: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

function normalizeDegrees(degrees: number): number {
  const normalized = ((degrees + 180) % 360 + 360) % 360 - 180
  return Math.round(normalized * 10) / 10
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
  const previewSvgRef = useRef<SVGSVGElement | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const parentOrigin = useMemo(() => embeddedParentOrigin(), [])
  const shopifyEmbedded = useMemo(() => isShopifyEmbed(), [])

  async function save() {
    const svg = previewSvgRef.current
    if (!svg) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const file = await svgElementToPngFile(svg, 'garupan-design.png')
      const uploaded = await uploadImage(file)

      const designData = serializeGarupanDesign({ background, stamps })

      const result = await saveDesign({
        variant: item.variant,
        composed_image_url: uploaded.source_image_url,
        design_data: designData,
      })

      const message = {
        type: 'decocom:design:ready' as const,
        variant: item.variant,
        design_id: result.design_id,
        preview_url: result.preview_image_url,
        print_image_url: result.composed_image_url,
      }
      window.parent.postMessage(message, parentOrigin)

      if (!shopifyEmbedded) {
        console.log('[garupan-editor] design saved', message)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました。もう一度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }

  const viewBox = `0 0 ${item.printWidth} ${item.printHeight}`

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
        <div className="garupan-canvas-wrap">
          <svg
            ref={previewSvgRef}
            className="garupan-canvas"
            viewBox={viewBox}
            role="img"
            aria-label={`${item.modelName} ガルパン自由レイアウト プレビュー`}
          >
            <defs>
              <clipPath id="garupan-pixel9a-clip-preview" clipPathUnits="userSpaceOnUse">
                <path d={PIXEL_9A_CASE_CLIP_PATH_D} clipRule="evenodd" />
              </clipPath>
            </defs>
            <path className="garupan-canvas__base" d={PIXEL_9A_CASE_CLIP_PATH_D} fillRule="evenodd" />
            <g clipPath="url(#garupan-pixel9a-clip-preview)">
              <rect width={item.printWidth} height={item.printHeight} fill={background.color} />
              <circle cx="42" cy="128" r="96" fill="#ffffff" opacity="0.28" />
              <circle cx="168" cy="338" r="118" fill="#ffffff" opacity="0.18" />
              {stamps.map(stamp => (
                <text
                  key={stamp.id}
                  dominantBaseline="central"
                  textAnchor="middle"
                  fontSize={stamp.size}
                  transform={`translate(${stamp.x} ${stamp.y}) rotate(${stamp.rotation})`}
                  aria-label={stamp.label}
                >
                  {stamp.emoji}
                </text>
              ))}
            </g>
            <path className="garupan-canvas__outline" d={PIXEL_9A_CASE_CLIP_PATH_D} fillRule="evenodd" />
          </svg>
        </div>
        <div className="garupan-preview-card">
          <h2>ガルパンコラボ</h2>
          <p>機種: {item.modelName}</p>
          <p>素材: {item.materialName}</p>
          <p>カラー: {item.colorName}</p>
          <p>価格: ¥{currency(item.price)}</p>
          <p>スタンプ数: {stamps.length}</p>
        </div>
        {saveError ? (
          <p className="garupan-preview-error">{saveError}</p>
        ) : null}
      </div>
      <footer className="garupan-preview-page__footer">
        <button type="button" className="garupan-primary-button" onClick={save} disabled={isSaving}>
          {isSaving ? '保存中...' : 'カートに入れる'}
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
            onScaleStamp={(id, size) => updateStamp(id, { size })}
            onRotateStamp={(id, rotation) => updateStamp(id, { rotation })}
            onDeleteStamp={id => {
              setStamps(prev => prev.filter(stamp => stamp.id !== id))
              setSelectedStampId(current => (current === id ? null : current))
            }}
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
