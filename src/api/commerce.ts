import type { Pixel9aRenderPayload } from '../pixel9a/transform'

export type UploadImageResponse = {
  source_image_url: string
}

export type RenderDesignResponse = {
  design_id: string
  composed_image_url: string
  preview_image_url: string
  width_px?: number
  height_px?: number
}

export type SaveDesignResponse = {
  design_id: string
  composed_image_url: string
  preview_image_url: string
}

export type ProductRenderPlacement = {
  centerX: number
  centerY: number
  imageWidth: number
  imageHeight: number
  scale: number
  rotationRad: number
}

function commerceBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_COMMERCE_API_BASE_URL
  if (!baseUrl) {
    throw new Error('VITE_COMMERCE_API_BASE_URL is not set')
  }
  return baseUrl.replace(/\/$/, '')
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`
    throw new Error(detail)
  }
  return body as T
}

export async function uploadImage(file: File): Promise<UploadImageResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${commerceBaseUrl()}/api/upload`, {
    method: 'POST',
    body: formData,
  })

  return parseJsonResponse<UploadImageResponse>(response)
}

export async function renderDesign(payload: Pixel9aRenderPayload): Promise<RenderDesignResponse> {
  const response = await fetch(`${commerceBaseUrl()}/api/skia/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<RenderDesignResponse>(response)
}

export async function renderProductVariant(
  variant: string,
  payload: {
    source_image_url: string
    placement: ProductRenderPlacement
  },
): Promise<RenderDesignResponse> {
  const url = `${commerceBaseUrl()}/api/products/${encodeURIComponent(variant)}/render`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (response.status === 404) {
    throw new Error(`${url} が 404 です。decocom_commerce を再起動してください。`)
  }

  return parseJsonResponse<RenderDesignResponse>(response)
}

export async function saveDesign(payload: {
  variant: string
  composed_image_url: string
  design_data: unknown
}): Promise<SaveDesignResponse> {
  const response = await fetch(`${commerceBaseUrl()}/api/designs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<SaveDesignResponse>(response)
}
