export type PrintSpec = {
  variant: string
  device: {
    code: string
    name: string
  }
  product_type: {
    code: string
    name: string
  }
  print_spec: {
    print_width: number
    print_height: number
    print_area_svg_url: string
    base_image_url: string | null
    safe_area_svg_url: string | null
    bleed_area_svg_url: string | null
  }
}

function commerceBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_COMMERCE_API_BASE_URL
  if (!baseUrl) {
    throw new Error('VITE_COMMERCE_API_BASE_URL is not set')
  }
  return baseUrl.replace(/\/$/, '')
}

export async function fetchPrintSpec(variant: string): Promise<PrintSpec> {
  const url = `${commerceBaseUrl()}/api/products/${encodeURIComponent(variant)}/print-spec`
  const response = await fetch(url)

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null
    const detail = typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`
    throw new Error(detail)
  }

  return response.json()
}
