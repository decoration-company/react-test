const PROXY_HOST_SUFFIXES = ['.sakurastorage.jp', '.supabase.co']

function commerceBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_COMMERCE_API_BASE_URL
  if (!baseUrl) {
    throw new Error('VITE_COMMERCE_API_BASE_URL is not set')
  }
  return baseUrl.replace(/\/$/, '')
}

/** Sakura 等 CORS 非対応ホストは commerce プロキシ経由に差し替える。 */
export function resolveRemoteAssetUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  try {
    const parsed = new URL(trimmed, window.location.href)
    if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') return trimmed
    if (parsed.origin === window.location.origin) return parsed.href

    const hostname = parsed.hostname.toLowerCase()
    const needsProxy = PROXY_HOST_SUFFIXES.some(
      suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
    if (!needsProxy) return parsed.href

    return `${commerceBaseUrl()}/api/assets/proxy?url=${encodeURIComponent(parsed.href)}`
  } catch {
    return trimmed
  }
}
