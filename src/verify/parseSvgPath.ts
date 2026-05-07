export type SvgPathResult = {
  d: string
  fillRule: 'nonzero' | 'evenodd'
  viewBox: { width: number; height: number }
}

function normalizeFillRule(value: string | null): 'nonzero' | 'evenodd' | null {
  if (value === 'evenodd' || value === 'even-odd') return 'evenodd'
  if (value === 'nonzero' || value === 'non-zero') return 'nonzero'
  return null
}

function inheritedFillRule(pathEl: SVGPathElement, svgEl: SVGSVGElement): 'nonzero' | 'evenodd' {
  let node: Element | null = pathEl
  while (node && node !== svgEl.parentElement) {
    const rule = normalizeFillRule(node.getAttribute('fill-rule') ?? node.getAttribute('clip-rule'))
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
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`SVG 取得失敗: HTTP ${response.status}`)
  }
  const text = await response.text()
  return parseSvgPath(text)
}
