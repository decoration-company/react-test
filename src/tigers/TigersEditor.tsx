import { useEffect, useMemo, useRef, useState } from 'react'
import type { PrintSpec } from '../api/commerce'
import {
  tigersLayouts,
  tigersStamps,
  tigersStampsOnSale,
  visibleTigersBackgrounds,
} from './tigersData'
import { TigersDesignPreview } from './TigersDesignPreview'
import { useTigersPrintSpec } from './tigersPrintSpec'
import { saveTigersDesign } from './tigersSave'
import type { TigersBackground, TigersLayout, TigersMockItem, TigersStamp, TigersStep } from './tigersTypes'
import './TigersEditor.css'

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

function stepNumber(step: TigersStep): number {
  if (step === 'stamp') return 1
  if (step === 'layout') return 2
  if (step === 'background') return 3
  return 3
}

function stepFromNumber(step: number): TigersStep {
  if (step === 1) return 'stamp'
  if (step === 2) return 'layout'
  return 'background'
}

function stepTexts(step: TigersStep) {
  if (step === 'stamp') {
    return {
      title: 'お気に入りのロゴを選ぼう',
      description: 'タップして選択してください',
      buttonLabel: '次へ：配置を選ぶ',
    }
  }
  if (step === 'layout') {
    return {
      title: '配置スタイルを選ぼう',
      description: 'タップして配置を選択',
      buttonLabel: '次へ：背景を選ぶ',
    }
  }
  if (step === 'background') {
    return {
      title: '背景デザインを選ぼう',
      description: 'タップして背景を選択',
      buttonLabel: '完成！確認する',
    }
  }
  return {
    title: 'プレビュー',
    description: '',
    buttonLabel: 'カートに入れる',
  }
}

function currency(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value)
}

function SelectedCaseInfoRibbon({ item }: { item: TigersMockItem }) {
  return (
    <div className="tigers-selected-ribbon">
      <span className="tigers-selected-ribbon__icon" aria-hidden="true" />
      <span>{item.modelName} / {item.materialName} / {item.colorName}</span>
    </div>
  )
}

function StampPreviewFull({ stamp }: { stamp: TigersStamp | null }) {
  const previewStamp = stamp ?? tigersStamps.find(item => item.id === '2') ?? tigersStamps[0]
  return (
    <div className="tigers-stamp-preview-full">
      <img className={stamp ? '' : 'is-empty'} src={previewStamp.imagePath} alt="" />
    </div>
  )
}

function StampGrid({
  stamps,
  selectedStamps,
  onSelect,
}: {
  stamps: TigersStamp[]
  selectedStamps: TigersStamp[]
  onSelect: (stamp: TigersStamp) => void
}) {
  return (
    <div className="tigers-stamp-grid">
      {stamps.map(stamp => {
        const selected = selectedStamps[0]?.id === stamp.id
        return (
          <button
            key={stamp.id}
            type="button"
            className={`tigers-stamp-card ${selected ? 'is-selected' : ''}`}
            onClick={() => onSelect(stamp)}
            aria-pressed={selected}
          >
            <img src={stamp.imagePath} alt="" />
            {selected ? <span className="tigers-check-badge" aria-hidden="true">✓</span> : null}
          </button>
        )
      })}
    </div>
  )
}

function LayoutSelection({
  item,
  layouts,
  stamps,
  selectedLayout,
  selectedStamps,
  onSelectLayout,
  onSelectLayoutStamp,
}: {
  item: TigersMockItem
  layouts: TigersLayout[]
  stamps: TigersStamp[]
  selectedLayout: TigersLayout | null
  selectedStamps: TigersStamp[]
  onSelectLayout: (layout: TigersLayout) => void
  onSelectLayoutStamp: (stamp: TigersStamp, index: number) => void
}) {
  const [activeSlot, setActiveSlot] = useState(0)
  const slotCount = selectedLayout?.stampCount ?? 1
  const activeSlotIndex = activeSlot % slotCount
  const showAdditionalStamps = slotCount > 1

  useEffect(() => {
    setActiveSlot(selectedLayout?.id === 'double' ? 1 : 0)
  }, [selectedLayout?.id])

  return (
    <div className="tigers-layout-selection">
      <div className="tigers-layout-options">
        {layouts.map(layout => {
          const selected = selectedLayout?.id === layout.id
          return (
            <button
              key={layout.id}
              type="button"
              className={`tigers-layout-option ${selected ? 'is-selected' : ''}`}
              onClick={() => onSelectLayout(layout)}
              aria-pressed={selected}
            >
              <span className={`tigers-layout-option__phone tigers-layout-option__phone--${item.caseKind}`}>
                <TigersDesignPreview
                  selectedStamps={selectedStamps}
                  selectedLayout={layout}
                  selectedBackground={null}
                  selectedItem={item}
                  mode="thumbnail"
                />
              </span>
              <span className="tigers-layout-option__name">{layout.name}</span>
              <span className="tigers-selection-dot" />
            </button>
          )
        })}
      </div>

      {showAdditionalStamps ? (
        <div className="tigers-additional-stamps">
          <div className="tigers-divider" />
          <p className="tigers-additional-stamps__title">追加のスタンプを選ぼう</p>
          <div className="tigers-stamp-slots">
            {Array.from({ length: selectedLayout?.stampCount ?? 0 }).map((_, index) => {
              const stamp = selectedStamps[index]
              return (
                <button
                  key={`slot-${index}`}
                  type="button"
                  className={`tigers-stamp-slot ${activeSlotIndex === index ? 'is-active' : ''} ${stamp ? 'has-stamp' : ''}`}
                  onClick={() => setActiveSlot(index)}
                >
                  {stamp ? <img src={stamp.imagePath} alt="" /> : null}
                  <span>{index + 1}</span>
                </button>
              )
            })}
          </div>
          <div className="tigers-stamp-grid">
            {stamps.map(stamp => (
              <button
                key={stamp.id}
                type="button"
                className="tigers-additional-stamp-card"
                onClick={() => {
                  onSelectLayoutStamp(stamp, activeSlotIndex)
                  setActiveSlot((activeSlotIndex + 1) % slotCount)
                }}
              >
                <img src={stamp.imagePath} alt="" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BackgroundSelection({
  backgrounds,
  selectedBackground,
  onSelect,
}: {
  backgrounds: TigersBackground[]
  selectedBackground: TigersBackground | null
  onSelect: (background: TigersBackground) => void
}) {
  return (
    <div className="tigers-background-selection">
      <div className="tigers-background-options">
        {backgrounds.map(background => {
          const selected = selectedBackground?.id === background.id
          return (
            <button
              key={background.id}
              type="button"
              className={`tigers-background-option ${selected ? 'is-selected' : ''}`}
              onClick={() => onSelect(background)}
              aria-pressed={selected}
            >
              <span
                className="tigers-background-option__thumb"
                style={background.imagePath ? { backgroundImage: `url(${background.imagePath})` } : undefined}
              />
              <span className="tigers-selection-dot" />
            </button>
          )
        })}
      </div>
      <p className="tigers-background-selection__name">{selectedBackground?.name ?? ''}</p>
    </div>
  )
}

function PreviewScreen({
  item,
  printSpec,
  selectedStamps,
  selectedLayout,
  selectedBackground,
  onBack,
}: {
  item: TigersMockItem
  printSpec: PrintSpec | null
  selectedStamps: TigersStamp[]
  selectedLayout: TigersLayout
  selectedBackground: TigersBackground
  onBack: () => void
}) {
  const mockupSvgRef = useRef<SVGSVGElement | null>(null)
  const printSvgRef = useRef<SVGSVGElement | null>(null)
  const [postToGallery] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const parentOrigin = useMemo(() => embeddedParentOrigin(), [])
  const shopifyEmbed = useMemo(() => isShopifyEmbed(), [])

  async function save() {
    const mockupSvg = mockupSvgRef.current
    const printSvg = printSvgRef.current
    if (!mockupSvg || !printSvg) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const message = await saveTigersDesign({
        item,
        printSpec,
        mockupSvg,
        printSvg,
        selectedStamps,
        selectedLayout,
        selectedBackground,
        postToGallery,
      })
      window.parent.postMessage(message, parentOrigin)

      if (!shopifyEmbed) {
        console.log('[tigers-editor] design saved', message)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました。もう一度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="tigers-preview-page">
      <header className="tigers-preview-page__appbar">
        <button type="button" aria-label="戻る" onClick={onBack}>‹</button>
        <h1>プレビュー</h1>
        <span />
      </header>
      <div className="tigers-preview-page__body">
        <div className="tigers-preview-page__mockup">
          <TigersDesignPreview
            ref={mockupSvgRef}
            selectedStamps={selectedStamps}
            selectedLayout={selectedLayout}
            selectedBackground={selectedBackground}
            selectedItem={item}
            mode="mockup"
          />
        </div>
        <div className="tigers-preview-page__print-export" aria-hidden="true">
          <TigersDesignPreview
            ref={printSvgRef}
            selectedStamps={selectedStamps}
            selectedLayout={selectedLayout}
            selectedBackground={selectedBackground}
            selectedItem={item}
            mode="print"
          />
        </div>
        <div className="tigers-preview-card">
          <h2>阪神タイガースコラボ</h2>
          <p>機種: {item.modelName}</p>
          <p>素材: {item.materialName}</p>
          <p>カラー: {item.colorName}</p>
          <p>価格: ¥{currency(item.price)}</p>
        </div>
        {saveError ? (
          <div className="tigers-preview-note">
            <span aria-hidden="true">!</span>
            <p>{saveError}</p>
          </div>
        ) : null}
      </div>
      <footer className="tigers-preview-page__footer">
        <button type="button" className="tigers-primary-button" onClick={save} disabled={isSaving}>
          {isSaving ? '保存中...' : 'カートに入れる'}
        </button>
      </footer>
    </section>
  )
}

export function TigersEditor({ variant }: { variant: string | null }) {
  const { item, printSpec, specLoading, specError } = useTigersPrintSpec(variant)
  const availableStamps = useMemo(() => tigersStampsOnSale(), [])

  const [currentStep, setCurrentStep] = useState<TigersStep>('stamp')
  const [selectedStamps, setSelectedStamps] = useState<TigersStamp[]>(() => {
    const firstStamp = tigersStampsOnSale()[0]
    return firstStamp ? [firstStamp] : []
  })
  const [selectedLayout, setSelectedLayout] = useState<TigersLayout>(tigersLayouts[0])
  const [selectedBackground, setSelectedBackground] = useState<TigersBackground>(visibleTigersBackgrounds[0])

  useEffect(() => {
    document.body.classList.add('tigers-editor-body')
    return () => document.body.classList.remove('tigers-editor-body')
  }, [])

  function selectStamp(stamp: TigersStamp) {
    setSelectedStamps(prev => (prev.length === 0 ? [stamp] : [stamp, ...prev.slice(1)]))
  }

  function selectLayoutStamp(stamp: TigersStamp, index: number) {
    setSelectedStamps(prev => {
      const next = [...prev]
      next[index] = stamp
      return next
    })
  }

  function selectLayout(layout: TigersLayout) {
    setSelectedLayout(layout)
    setSelectedStamps(prev => {
      const fallback = prev[0] ?? availableStamps[0]
      if (!fallback) return prev
      return Array.from({ length: layout.stampCount }, (_, index) => prev[index] ?? fallback)
    })
  }

  function canJump(step: TigersStep): boolean {
    if (step === 'layout') return selectedStamps.length > 0
    if (step === 'background') return selectedStamps.length >= selectedLayout.stampCount
    return true
  }

  function jumpToStep(step: TigersStep) {
    if (!canJump(step)) return
    setCurrentStep(step)
  }

  function goBack() {
    if (currentStep === 'preview') {
      setCurrentStep('background')
      return
    }
    const number = stepNumber(currentStep)
    if (number > 1) setCurrentStep(stepFromNumber(number - 1))
  }

  function nextStep() {
    if (currentStep === 'stamp') {
      jumpToStep('layout')
      return
    }
    if (currentStep === 'layout') {
      jumpToStep('background')
      return
    }
    setCurrentStep('preview')
  }

  const isNextEnabled =
    currentStep === 'stamp'
      ? selectedStamps.length > 0
      : currentStep === 'layout'
        ? selectedStamps.length >= selectedLayout.stampCount
        : true

  if (currentStep === 'preview') {
    return (
      <PreviewScreen
        item={item}
        printSpec={printSpec}
        selectedStamps={selectedStamps}
        selectedLayout={selectedLayout}
        selectedBackground={selectedBackground}
        onBack={goBack}
      />
    )
  }

  const text = stepTexts(currentStep)
  const stepClass = `is-step-${currentStep}`

  return (
    <section className={`tigers-editor ${stepClass}`}>
      {specLoading ? (
        <p className="tigers-editor__spec-status" role="status">商品情報を読み込み中...</p>
      ) : null}
      {specError ? (
        <p className="tigers-editor__spec-status tigers-editor__spec-status--warn" role="status">
          印刷仕様の取得に失敗しました（ローカル設定で続行）: {specError}
        </p>
      ) : null}
      <div className="tigers-editor__left">
        <header className="tigers-editor__header">
          <div className="tigers-editor__header-side">
            <button type="button" className="tigers-back-button" aria-label="戻る" onClick={goBack}>‹</button>
          </div>
          <h1>STEP {stepNumber(currentStep)}</h1>
          <div className="tigers-step-indicator" aria-label="ステップ">
            {[1, 2, 3].map(number => {
              const active = stepNumber(currentStep) === number
              return (
                <button
                  key={number}
                  type="button"
                  className={active ? 'is-active' : ''}
                  onClick={() => jumpToStep(stepFromNumber(number))}
                  aria-label={`STEP ${number}`}
                  aria-current={active ? 'step' : undefined}
                />
              )
            })}
          </div>
        </header>
        <div className="tigers-preview-area">
          <SelectedCaseInfoRibbon item={item} />
          <div className="tigers-preview-area__center">
            {currentStep === 'stamp' ? (
              <StampPreviewFull stamp={selectedStamps[0] ?? null} />
            ) : (
              <TigersDesignPreview
                selectedStamps={selectedStamps}
                selectedLayout={selectedLayout}
                selectedBackground={selectedBackground}
                selectedItem={item}
              />
            )}
          </div>
        </div>
      </div>

      <div className="tigers-editor__right">
        <div className="tigers-section-title">
          <h2>{text.title}</h2>
          <p>{text.description}</p>
        </div>
        <div className="tigers-selection-scroll">
          {currentStep === 'stamp' ? (
            <StampGrid stamps={availableStamps} selectedStamps={selectedStamps} onSelect={selectStamp} />
          ) : null}
          {currentStep === 'layout' ? (
            <LayoutSelection
              item={item}
              layouts={tigersLayouts}
              stamps={availableStamps}
              selectedLayout={selectedLayout}
              selectedStamps={selectedStamps}
              onSelectLayout={selectLayout}
              onSelectLayoutStamp={selectLayoutStamp}
            />
          ) : null}
          {currentStep === 'background' ? (
            <BackgroundSelection
              backgrounds={visibleTigersBackgrounds}
              selectedBackground={selectedBackground}
              onSelect={setSelectedBackground}
            />
          ) : null}
        </div>
        <footer className="tigers-editor__footer">
          <button
            type="button"
            className="tigers-primary-button"
            onClick={nextStep}
            disabled={!isNextEnabled}
          >
            {text.buttonLabel}
          </button>
        </footer>
      </div>
    </section>
  )
}
