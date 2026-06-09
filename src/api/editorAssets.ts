export type EditorAssetRecord = {
  id: string
  type: string
  name: string
  display_url: string
  enabled: boolean
  category: string
  tags: string[]
  sort_order: number
  meta: Record<string, unknown>
}

export type EditorAssetsResponse = {
  assets: EditorAssetRecord[]
}

function commerceBaseUrl(): string {
  const base = import.meta.env.VITE_COMMERCE_API_BASE_URL
  if (!base) {
    throw new Error('VITE_COMMERCE_API_BASE_URL is not set')
  }
  return base.replace(/\/$/, '')
}

export function resolveEditorAssetsShopDomain(): string {
  const params = new URLSearchParams(window.location.search)
  return (
    params.get('shop_domain') ??
    import.meta.env.VITE_EDITOR_ASSETS_SHOP_DOMAIN ??
    'decocom-test.myshopify.com'
  )
}

export async function fetchEditorAssetsCatalog(
  ipSlug: string,
  shopDomain = resolveEditorAssetsShopDomain(),
): Promise<EditorAssetRecord[]> {
  const url = new URL(`${commerceBaseUrl()}/api/v1/editor_assets`)
  url.searchParams.set('shop_domain', shopDomain)
  url.searchParams.set('ip_slug', ipSlug)
  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`editor_assets HTTP ${response.status}`)
  }
  const data = (await response.json()) as EditorAssetsResponse
  return data.assets ?? []
}
