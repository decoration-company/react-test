import { PIXEL_9A_CASE_CLIP_PATH_BOUNDS } from './constants'

export const PIXEL_9A_DEVICE_ID = 'pixel-9a' as const
export const PIXEL_9A_IMAGE_MIN_SCALE = 0.1
export const PIXEL_9A_IMAGE_MAX_SCALE = 4

export type Pixel9aDesignArea = {
  width: number
  height: number
}

export type Pixel9aEditorImageTransform = {
  centerX: number
  centerY: number
  imageWidth: number
  imageHeight: number
  scale: number
  rotationRad: number
}

export type Pixel9aEditorImageItem = {
  id: string
  sourceImageUrl: string
  naturalWidth: number
  naturalHeight: number
  transform: Pixel9aEditorImageTransform
}

export type Pixel9aDesignItemPayload = {
  id: string
  type: 'image'
  source_image_url: string
  top_left_pos_dx: number
  top_left_pos_dy: number
  size_width: number
  size_height: number
  scale: number
  angle: number
  scale_alignment: 'topLeft'
}

export type Pixel9aRenderPayload = {
  device: typeof PIXEL_9A_DEVICE_ID
  source_image_url: string
  design_area: Pixel9aDesignArea
  items: Pixel9aDesignItemPayload[]
}

export const PIXEL_9A_DESIGN_AREA: Pixel9aDesignArea = {
  width: PIXEL_9A_CASE_CLIP_PATH_BOUNDS.width,
  height: PIXEL_9A_CASE_CLIP_PATH_BOUNDS.height,
}

export function createImageItemId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `image-${Date.now().toString(36)}`
}

export function clampImageScale(scale: number): number {
  return Math.min(Math.max(scale, PIXEL_9A_IMAGE_MIN_SCALE), PIXEL_9A_IMAGE_MAX_SCALE)
}

export function createCoverTransform(
  naturalWidth: number,
  naturalHeight: number,
  designArea: Pixel9aDesignArea = PIXEL_9A_DESIGN_AREA,
): Pixel9aEditorImageTransform {
  const coverScale = Math.max(designArea.width / naturalWidth, designArea.height / naturalHeight)

  return {
    centerX: designArea.width / 2,
    centerY: designArea.height / 2,
    imageWidth: naturalWidth * coverScale,
    imageHeight: naturalHeight * coverScale,
    scale: 1,
    rotationRad: 0,
  }
}

export function transformToDesignItemPayload(
  item: Pixel9aEditorImageItem,
): Pixel9aDesignItemPayload {
  const { transform } = item
  const scaledWidth = transform.imageWidth * transform.scale
  const scaledHeight = transform.imageHeight * transform.scale

  return {
    id: item.id,
    type: 'image',
    source_image_url: item.sourceImageUrl,
    top_left_pos_dx: transform.centerX - scaledWidth / 2,
    top_left_pos_dy: transform.centerY - scaledHeight / 2,
    size_width: transform.imageWidth,
    size_height: transform.imageHeight,
    scale: transform.scale,
    angle: transform.rotationRad,
    scale_alignment: 'topLeft',
  }
}

export function createRenderPayload(item: Pixel9aEditorImageItem): Pixel9aRenderPayload {
  return {
    device: PIXEL_9A_DEVICE_ID,
    source_image_url: item.sourceImageUrl,
    design_area: PIXEL_9A_DESIGN_AREA,
    items: [transformToDesignItemPayload(item)],
  }
}

export function clientPointToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): DOMPoint {
  const point = new DOMPoint(clientX, clientY)
  const matrix = svg.getScreenCTM()

  if (!matrix) {
    const rect = svg.getBoundingClientRect()
    return new DOMPoint(
      ((clientX - rect.left) / rect.width) * PIXEL_9A_DESIGN_AREA.width,
      ((clientY - rect.top) / rect.height) * PIXEL_9A_DESIGN_AREA.height,
    )
  }

  return point.matrixTransform(matrix.inverse())
}

export function clientDeltaToSvgDelta(svg: SVGSVGElement, deltaX: number, deltaY: number): DOMPoint {
  const rect = svg.getBoundingClientRect()
  return new DOMPoint(
    (deltaX / rect.width) * PIXEL_9A_DESIGN_AREA.width,
    (deltaY / rect.height) * PIXEL_9A_DESIGN_AREA.height,
  )
}
