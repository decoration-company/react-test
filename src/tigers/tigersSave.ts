import {
  renderProductVariant,
  saveDesign,
  uploadImage,
  type PrintSpec,
  type ProductRenderPlacement,
} from '../api/commerce'
import { tigersCommerceHeaders } from './tigersAccess'
import { svgElementToPngFile } from '../api/svgExport'
import { serializeTigersDesign } from './tigersDesignSerialization'
import type { TigersBackground, TigersLayout, TigersMockItem, TigersStamp } from './tigersTypes'

export type TigersDesignReadyMessage = {
  type: 'decocom:design:ready'
  variant: string
  spec_id: string
  design_id: string
  preview_url: string
  print_image_url: string
}

function readNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('画像を読み込めませんでした'))
    img.src = src
  })
}

function coverPlacement(
  image: { width: number; height: number },
  canvas: { width: number; height: number },
): ProductRenderPlacement {
  const coverScale = Math.max(canvas.width / image.width, canvas.height / image.height)
  return {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
    imageWidth: image.width * coverScale,
    imageHeight: image.height * coverScale,
    scale: 1,
    rotationRad: 0,
  }
}

function renderCanvasSize(item: TigersMockItem, printSpec: PrintSpec | null) {
  const width = printSpec?.print_spec.placement_canvas_width ?? item.printWidth
  const height = printSpec?.print_spec.placement_canvas_height ?? item.printHeight
  return { width, height }
}

export async function saveTigersDesign({
  item,
  printSpec,
  mockupSvg,
  printSvg,
  selectedStamps,
  selectedLayout,
  selectedBackground,
  postToGallery,
}: {
  item: TigersMockItem
  printSpec: PrintSpec | null
  mockupSvg: SVGSVGElement
  printSvg: SVGSVGElement
  selectedStamps: TigersStamp[]
  selectedLayout: TigersLayout
  selectedBackground: TigersBackground
  postToGallery: boolean
}): Promise<TigersDesignReadyMessage> {
  const printExportSize = {
    outputWidth: item.printWidth,
    outputHeight: item.printHeight,
  }

  const [mockupFile, printFile] = await Promise.all([
    svgElementToPngFile(mockupSvg, 'tigers-preview.png'),
    svgElementToPngFile(printSvg, 'tigers-print.png', printExportSize),
  ])

  const commerceHeaders = tigersCommerceHeaders()

  const [mockupUpload, printUpload] = await Promise.all([
    uploadImage(mockupFile, commerceHeaders),
    uploadImage(printFile, commerceHeaders),
  ])

  let composedImageUrl = printUpload.source_image_url
  const previewImageUrl = mockupUpload.source_image_url

  try {
    const canvas = renderCanvasSize(item, printSpec)
    const natural = await readNaturalSize(printUpload.source_image_url)
    const rendered = await renderProductVariant(
      item.variant,
      {
        source_image_url: printUpload.source_image_url,
        placement: coverPlacement(natural, canvas),
      },
      commerceHeaders,
    )
    composedImageUrl = rendered.composed_image_url
  } catch {
    // commerce render 未対応 variant はクライアント書き出し PNG をそのまま使う
  }

  const designData = serializeTigersDesign({
    layout: selectedLayout,
    stamps: selectedStamps,
    background: selectedBackground,
  })

  const result = await saveDesign(
    {
      variant: item.variant,
      composed_image_url: composedImageUrl,
      design_data: {
        ...designData,
        post_to_gallery: postToGallery,
      },
    },
    commerceHeaders,
  )

  return {
    type: 'decocom:design:ready',
    variant: item.variant,
    spec_id: result.design_id,
    design_id: result.design_id,
    preview_url: previewImageUrl,
    print_image_url: composedImageUrl,
  }
}
