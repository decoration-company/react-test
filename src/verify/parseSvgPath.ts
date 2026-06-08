export type SvgPathResult = {
  d: string
  fillRule: 'nonzero' | 'evenodd'
  viewBox: { width: number; height: number }
}

export type SvgShapeResult = {
  markup: string
  clipMarkup: string
  imageFillMarkup: string
  viewBox: { width: number; height: number }
}

export type GripCaseClipParts = {
  printArea: SvgShapeResult
  safeArea: SvgShapeResult | null
  bleedArea: SvgShapeResult | null
}

export type DiaryGuideLayerRole = 'body' | 'spine' | 'camera' | 'stitch'

export type DiaryGuideLayer = {
  id: string
  role: DiaryGuideLayerRole
  markup: string
}

export type DiaryPrintMask = {
  /** #bleed — マスクで表示する領域 (白)。Flutter 印刷クリップと同じ */
  showMarkup: string
  /** #camera-hole — マスクで抜く領域 (黒)。無い機種は null */
  holeMarkup: string | null
}

export type DiaryCaseClipParts = GripCaseClipParts & {
  guideLayers: DiaryGuideLayer[]
  printMask: DiaryPrintMask
}

const DIARY_GUIDE_LAYER_SPECS: ReadonlyArray<{ id: string; role: DiaryGuideLayerRole }> = [
  { id: 'belt-left-body', role: 'body' },
  { id: 'belt-right-body', role: 'body' },
  { id: 'actual-size', role: 'body' },
  { id: 'spine-area', role: 'spine' },
  { id: 'camera-hole', role: 'camera' },
  { id: 'stitch-line', role: 'stitch' },
  { id: 'belt-left-stitch', role: 'stitch' },
  { id: 'belt-right-stitch', role: 'stitch' },
]

import { resolveRemoteAssetUrl } from '../lib/resolveRemoteAssetUrl'

const SVG_LOG_PREFIX = '[verify-svg]'

function logSvg(message: string, data?: unknown): void {
  console.info(`${SVG_LOG_PREFIX} ${message}`, data ?? '')
}

function normalizeFillRule(value: string | null): 'nonzero' | 'evenodd' | null {
  if (value === 'evenodd' || value === 'even-odd') return 'evenodd'
  if (value === 'nonzero' || value === 'non-zero') return 'nonzero'
  return null
}

function styleProperty(style: string | null, property: string): string | null {
  if (!style) return null
  const parts = style.split(';')
  for (const part of parts) {
    const [name, ...valueParts] = part.split(':')
    if (name?.trim().toLowerCase() === property) {
      return valueParts.join(':').trim().toLowerCase()
    }
  }
  return null
}

function elementFillRule(el: Element): 'nonzero' | 'evenodd' | null {
  return (
    normalizeFillRule(el.getAttribute('fill-rule') ?? el.getAttribute('clip-rule')) ??
    normalizeFillRule(styleProperty(el.getAttribute('style'), 'fill-rule')) ??
    normalizeFillRule(styleProperty(el.getAttribute('style'), 'clip-rule'))
  )
}

function inheritedFillRule(pathEl: SVGPathElement, svgEl: SVGSVGElement): 'nonzero' | 'evenodd' {
  let node: Element | null = pathEl
  while (node && node !== svgEl.parentElement) {
    const rule = elementFillRule(node)
    if (rule) return rule
    node = node.parentElement
  }
  return 'nonzero'
}

export function parseSvgPath(svgText: string): SvgPathResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  const errorNode = doc.querySelector('parsererror')
  if (errorNode) {
    throw new Error('SVG 解析失敗: パースエラー')
  }

  const svgEl = doc.querySelector('svg')
  if (!svgEl) {
    throw new Error('SVG 解析失敗: <svg> が見つかりません')
  }

  // The grip-case print assets may express holes as one evenodd path or as
  // multiple paths. Flatten path data here so the preview clip/outline keeps
  // camera and strap holes without requiring an SVG rendering library.
  const pathEls = [...doc.querySelectorAll('path')]
  if (pathEls.length === 0) {
    throw new Error('SVG 解析失敗: <path> が見つかりません')
  }

  const pathData = pathEls
    .map(pathEl => pathEl.getAttribute('d')?.trim() ?? '')
    .filter(Boolean)
  const d = pathData.join(' ')
  if (!d) {
    throw new Error('SVG 解析失敗: path の d 属性がありません')
  }

  const fillRule = pathEls.some(pathEl => inheritedFillRule(pathEl, svgEl) === 'evenodd')
    ? 'evenodd'
    : 'nonzero'

  const viewBoxAttr = svgEl.getAttribute('viewBox')
  let width = 0
  let height = 0
  if (viewBoxAttr) {
    const parts = viewBoxAttr.split(/[\s,]+/).map(Number)
    if (parts.length >= 4) {
      width = parts[2]
      height = parts[3]
    }
  }

  if (width <= 0 || height <= 0) {
    throw new Error('SVG 解析失敗: viewBox が不正です')
  }

  return { d, fillRule, viewBox: { width, height } }
}

export async function fetchAndParseSvgPath(url: string): Promise<SvgPathResult> {
  const response = await fetch(resolveRemoteAssetUrl(url))
  if (!response.ok) {
    throw new Error(`SVG 取得失敗: HTTP ${response.status}`)
  }
  const text = await response.text()
  return parseSvgPath(text)
}

function parseSvgDocument(svgText: string): { doc: Document; viewBox: { width: number; height: number } } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  const errorNode = doc.querySelector('parsererror')
  if (errorNode) {
    throw new Error('SVG 解析失敗: パースエラー')
  }

  const svgEl = doc.querySelector('svg')
  if (!svgEl) {
    throw new Error('SVG 解析失敗: <svg> が見つかりません')
  }

  const viewBoxAttr = svgEl.getAttribute('viewBox')
  let width = 0
  let height = 0
  if (viewBoxAttr) {
    const parts = viewBoxAttr.split(/[\s,]+/).map(Number)
    if (parts.length >= 4) {
      width = parts[2]
      height = parts[3]
    }
  }

  if (width <= 0 || height <= 0) {
    throw new Error('SVG 解析失敗: viewBox が不正です')
  }

  return { doc, viewBox: { width, height } }
}

function stripUnsafeSvgNodes(root: Element): void {
  root.querySelectorAll('script, foreignObject').forEach(node => node.remove())
  const elements = [root, ...root.querySelectorAll('*')]
  elements.forEach(el => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  })
}

function isPaintableSvgElement(el: Element): boolean {
  return [
    'circle',
    'ellipse',
    'path',
    'polygon',
    'polyline',
    'rect',
  ].includes(el.localName)
}

function normalizeClipSvgPart(root: Element): void {
  const elements = [root, ...root.querySelectorAll('*')]
  elements.forEach(el => {
    const fillRule = elementFillRule(el)

    el.removeAttribute('class')
    el.removeAttribute('style')
    el.removeAttribute('opacity')
    el.removeAttribute('fill-opacity')
    el.removeAttribute('stroke-opacity')
    el.removeAttribute('stroke-width')
    el.removeAttribute('stroke-linecap')
    el.removeAttribute('stroke-linejoin')
    el.removeAttribute('vector-effect')

    if (isPaintableSvgElement(el)) {
      el.setAttribute('fill', '#000')
      el.setAttribute('stroke', 'none')
      el.setAttribute('fill-opacity', '1')
      if (fillRule) {
        el.setAttribute('fill-rule', fillRule)
        el.setAttribute('clip-rule', fillRule)
      }
    }
  })
}

function normalizeImageFillSvgPart(root: Element): void {
  const elements = [root, ...root.querySelectorAll('*')]
  elements.forEach(el => {
    const fillRule = elementFillRule(el)

    el.removeAttribute('class')
    el.removeAttribute('style')
    el.removeAttribute('opacity')
    el.removeAttribute('fill-opacity')
    el.removeAttribute('stroke-opacity')
    el.removeAttribute('stroke-width')
    el.removeAttribute('stroke-linecap')
    el.removeAttribute('stroke-linejoin')
    el.removeAttribute('vector-effect')

    if (isPaintableSvgElement(el)) {
      el.setAttribute('fill', '#000')
      el.setAttribute('stroke', 'none')
      el.setAttribute('fill-opacity', '1')
      if (fillRule) {
        el.setAttribute('fill-rule', fillRule)
        el.setAttribute('clip-rule', fillRule)
      }
    }
  })
}

function serializeSvgPart(doc: Document, partId: string): SvgShapeResult['markup'] | null {
  const source = doc.getElementById(partId)
  if (!source) return null

  const clone = source.cloneNode(true) as Element
  clone.removeAttribute('id')
  stripUnsafeSvgNodes(clone)
  return new XMLSerializer().serializeToString(clone)
}

function serializeClipSvgPart(doc: Document, partId: string): SvgShapeResult['clipMarkup'] | null {
  const source = doc.getElementById(partId)
  if (!source) return null

  const clone = source.cloneNode(true) as Element
  clone.removeAttribute('id')
  stripUnsafeSvgNodes(clone)
  normalizeClipSvgPart(clone)
  return new XMLSerializer().serializeToString(clone)
}

function serializeMaskSvgPart(doc: Document, partId: string, fill: string): string | null {
  const source = doc.getElementById(partId)
  if (!source) return null

  const clone = source.cloneNode(true) as Element
  clone.removeAttribute('id')
  stripUnsafeSvgNodes(clone)
  const elements = [clone, ...clone.querySelectorAll('*')]
  elements.forEach(el => {
    const fillRule = elementFillRule(el)

    el.removeAttribute('class')
    el.removeAttribute('style')
    el.removeAttribute('opacity')
    el.removeAttribute('fill-opacity')
    el.removeAttribute('stroke-opacity')
    el.removeAttribute('stroke-width')
    el.removeAttribute('stroke-linecap')
    el.removeAttribute('stroke-linejoin')
    el.removeAttribute('vector-effect')

    if (isPaintableSvgElement(el)) {
      el.setAttribute('fill', fill)
      el.setAttribute('stroke', 'none')
      el.setAttribute('fill-opacity', '1')
      if (fillRule) {
        el.setAttribute('fill-rule', fillRule)
      }
    }
  })
  return new XMLSerializer().serializeToString(clone)
}

function serializeImageFillSvgPart(doc: Document, partId: string): SvgShapeResult['imageFillMarkup'] | null {
  const source = doc.getElementById(partId)
  if (!source) return null

  const clone = source.cloneNode(true) as Element
  clone.removeAttribute('id')
  stripUnsafeSvgNodes(clone)
  normalizeImageFillSvgPart(clone)
  return new XMLSerializer().serializeToString(clone)
}

function describeSvgPart(doc: Document, partId: string): Record<string, unknown> | null {
  const source = doc.getElementById(partId)
  if (!source) return null

  const paintable = [source, ...source.querySelectorAll('*')].filter(isPaintableSvgElement)
  const paths = [...source.querySelectorAll('path')]
  return {
    tag: source.localName,
    childElementCount: source.children.length,
    paintableCount: paintable.length,
    pathCount: paths.length,
    hasInlineStyle: [source, ...source.querySelectorAll('*')].some(el => el.hasAttribute('style')),
    styles: paths.slice(0, 8).map(path => path.getAttribute('style')),
    fillRules: paths.slice(0, 8).map(path => elementFillRule(path)),
    markupLength: new XMLSerializer().serializeToString(source).length,
  }
}

export function parseGripCaseClipSvg(svgText: string): GripCaseClipParts {
  const { doc, viewBox } = parseSvgDocument(svgText)
  logSvg('parseGripCaseClipSvg:start', {
    textLength: svgText.length,
    viewBox,
    printArea: describeSvgPart(doc, 'print_area'),
    safeArea: describeSvgPart(doc, 'safe_area'),
    bleedArea: describeSvgPart(doc, 'bleed_area'),
  })

  const printAreaMarkup = serializeSvgPart(doc, 'print_area')
  const printAreaClipMarkup = serializeClipSvgPart(doc, 'print_area')
  const printAreaImageFillMarkup = serializeImageFillSvgPart(doc, 'print_area')
  if (!printAreaMarkup || !printAreaClipMarkup || !printAreaImageFillMarkup) {
    throw new Error('SVG 解析失敗: #print_area が見つかりません')
  }

  const safeAreaMarkup = serializeSvgPart(doc, 'safe_area')
  const bleedAreaMarkup = serializeSvgPart(doc, 'bleed_area')

  logSvg('parseGripCaseClipSvg:done', {
    printAreaMarkupLength: printAreaMarkup.length,
    printAreaClipMarkupLength: printAreaClipMarkup.length,
    printAreaImageFillMarkupLength: printAreaImageFillMarkup.length,
    safeAreaMarkupLength: safeAreaMarkup?.length ?? 0,
    bleedAreaMarkupLength: bleedAreaMarkup?.length ?? 0,
    printAreaClipMarkupPreview: printAreaClipMarkup.slice(0, 500),
    printAreaImageFillMarkupPreview: printAreaImageFillMarkup.slice(0, 500),
  })

  return {
    printArea: {
      markup: printAreaMarkup,
      clipMarkup: printAreaClipMarkup,
      imageFillMarkup: printAreaImageFillMarkup,
      viewBox,
    },
    safeArea: safeAreaMarkup
      ? { markup: safeAreaMarkup, clipMarkup: safeAreaMarkup, imageFillMarkup: safeAreaMarkup, viewBox }
      : null,
    bleedArea: bleedAreaMarkup
      ? { markup: bleedAreaMarkup, clipMarkup: bleedAreaMarkup, imageFillMarkup: bleedAreaMarkup, viewBox }
      : null,
  }
}

export function svgPathToShape(path: SvgPathResult): SvgShapeResult {
  const fillRule = path.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'
  return {
    markup: `<path d="${path.d.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" fill-rule="${fillRule}" clip-rule="${fillRule}" />`,
    clipMarkup: `<path d="${path.d.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" fill="#000" stroke="none" fill-rule="${fillRule}" clip-rule="${fillRule}" />`,
    imageFillMarkup: `<path d="${path.d.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" fill="#000" stroke="none" fill-rule="${fillRule}" clip-rule="${fillRule}" />`,
    viewBox: path.viewBox,
  }
}

function collectDiaryGuideLayers(doc: Document): DiaryGuideLayer[] {
  const layers: DiaryGuideLayer[] = []
  for (const spec of DIARY_GUIDE_LAYER_SPECS) {
    const markup = serializeSvgPart(doc, spec.id)
    if (!markup) continue
    layers.push({ id: spec.id, role: spec.role, markup })
  }
  logSvg('parseDiaryCaseClipSvg:guideLayers', {
    found: layers.map(layer => layer.id),
    missing: DIARY_GUIDE_LAYER_SPECS.map(spec => spec.id).filter(
      id => !layers.some(layer => layer.id === id),
    ),
  })
  return layers
}

function escapePathAttr(d: string): string {
  return d.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/** 手帳型の印刷クリップ = #bleed + #camera-hole (evenOdd)。Flutter と同じ */
function buildDiaryPrintClipMarkup(doc: Document): { clipMarkup: string; imageFillMarkup: string } {
  const bleedEl = doc.getElementById('bleed')
  if (!bleedEl) {
    throw new Error('SVG 解析失敗: #bleed が見つかりません')
  }

  const cameraEl = doc.getElementById('camera-hole')
  if (cameraEl?.localName === 'path' && bleedEl.localName === 'path') {
    const bleedD = bleedEl.getAttribute('d')?.trim() ?? ''
    const cameraD = cameraEl.getAttribute('d')?.trim() ?? ''
    const combined = `${bleedD} ${cameraD}`.trim()
    const rule = 'evenodd'
    const markup = `<path d="${escapePathAttr(combined)}" fill="#000" stroke="none" fill-rule="${rule}" clip-rule="${rule}" />`
    return { clipMarkup: markup, imageFillMarkup: markup }
  }

  const clipMarkup = serializeClipSvgPart(doc, 'bleed') ?? ''
  const imageFillMarkup = serializeImageFillSvgPart(doc, 'bleed') ?? ''
  if (!clipMarkup || !imageFillMarkup) {
    throw new Error('SVG 解析失敗: #bleed のクリップを生成できません')
  }
  return { clipMarkup, imageFillMarkup }
}

/** 手帳型 diary_clip: デザインは #bleed、ガイド枠は #actual-size */
export function parseDiaryCaseClipSvg(svgText: string): DiaryCaseClipParts {
  const { doc, viewBox } = parseSvgDocument(svgText)
  const actualEl = doc.getElementById('actual-size')
  if (!actualEl) {
    throw new Error('SVG 解析失敗: #actual-size が見つかりません')
  }

  const { clipMarkup, imageFillMarkup } = buildDiaryPrintClipMarkup(doc)

  const showMarkup = serializeMaskSvgPart(doc, 'bleed', '#ffffff')
  if (!showMarkup) {
    throw new Error('SVG 解析失敗: #bleed のマスクを生成できません')
  }

  const cameraEl = doc.getElementById('camera-hole')
  const holeMarkup = cameraEl ? serializeMaskSvgPart(doc, 'camera-hole', '#000000') : null

  const outlineMarkup = serializeSvgPart(doc, 'actual-size') ?? clipMarkup
  const bleedMarkup = serializeSvgPart(doc, 'bleed')

  const printArea: SvgShapeResult = {
    markup: outlineMarkup,
    clipMarkup,
    imageFillMarkup,
    viewBox,
  }

  return {
    printArea,
    safeArea: null,
    bleedArea: bleedMarkup
      ? { markup: bleedMarkup, clipMarkup: bleedMarkup, imageFillMarkup: bleedMarkup, viewBox }
      : null,
    guideLayers: collectDiaryGuideLayers(doc),
    printMask: { showMarkup, holeMarkup },
  }
}

export async function fetchAndParseDiaryCaseClip(url: string): Promise<DiaryCaseClipParts> {
  const response = await fetch(resolveRemoteAssetUrl(url))
  if (!response.ok) {
    throw new Error(`SVG 取得失敗: HTTP ${response.status}`)
  }
  return parseDiaryCaseClipSvg(await response.text())
}

export async function fetchAndParseGripCaseClip(url: string): Promise<GripCaseClipParts> {
  const fetchUrl = resolveRemoteAssetUrl(url)
  logSvg('fetchAndParseGripCaseClip:start', { url, fetchUrl })
  const response = await fetch(fetchUrl)
  logSvg('fetchAndParseGripCaseClip:response', {
    url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
  })
  if (!response.ok) {
    throw new Error(`SVG 取得失敗: HTTP ${response.status}`)
  }
  const text = await response.text()
  return parseGripCaseClipSvg(text)
}
