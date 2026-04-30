import type { Pixel9aRenderPayload } from '../pixel9a/transform'

export type UploadImageResponse = {
  source_image_url: string
}

export type RenderDesignResponse = {
  design_id: string
  composed_image_url: string
  preview_image_url: string
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

