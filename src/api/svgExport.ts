const EXPORT_SCALE = 3

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read blob'))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function inlineImages(svg: SVGElement): Promise<void> {
  const images = svg.querySelectorAll('image')
  await Promise.all(
    Array.from(images).map(async (img) => {
      const href = img.getAttribute('href') ?? img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      if (!href || href.startsWith('data:')) return
      try {
        const response = await fetch(href)
        const blob = await response.blob()
        const dataUrl = await blobToDataUrl(blob)
        img.setAttribute('href', dataUrl)
        img.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
      } catch {
        // skip unreachable images
      }
    }),
  )
}

export async function svgElementToPngFile(
  svg: SVGSVGElement,
  filename: string,
): Promise<File> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  await inlineImages(clone)

  const vb = svg.viewBox.baseVal
  const width = vb.width || svg.clientWidth
  const height = vb.height || svg.clientHeight

  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  const svgString = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const pxWidth = Math.round(width * EXPORT_SCALE)
  const pxHeight = Math.round(height * EXPORT_SCALE)

  const canvas = document.createElement('canvas')
  canvas.width = pxWidth
  canvas.height = pxHeight
  const ctx = canvas.getContext('2d')!

  const img = new Image()
  img.src = url

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, pxWidth, pxHeight)
      URL.revokeObjectURL(url)
      resolve()
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG の画像変換に失敗しました'))
    }
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG への変換に失敗しました'))),
      'image/png',
    )
  })

  return new File([blob], filename, { type: 'image/png' })
}
