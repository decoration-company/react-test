export type TigersEmbedContext = {
  embed: boolean
  parentOrigin: string
  shopDomain: string
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw.split(',').map(part => part.trim()).filter(Boolean)
}

function normalizeOrigin(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  try {
    if (text.includes('://')) {
      return new URL(text).origin.toLowerCase()
    }
    return new URL(`https://${text}`).origin.toLowerCase()
  } catch {
    return null
  }
}

export function readTigersEmbedContext(): TigersEmbedContext {
  const params = new URLSearchParams(window.location.search)
  const parentOrigin = params.get('origin') ?? params.get('parent_origin') ?? '*'
  let normalizedParentOrigin = parentOrigin
  if (parentOrigin !== '*') {
    normalizedParentOrigin = normalizeOrigin(parentOrigin) ?? parentOrigin
  }

  return {
    embed: params.get('embed') === 'shopify' || params.get('platform') === 'shopify',
    parentOrigin: normalizedParentOrigin,
    shopDomain: (params.get('shop') ?? '').trim().toLowerCase(),
  }
}

export function assessTigersEmbedAccess(): { allowed: boolean; reason?: string } {
  const allowedOrigins = parseAllowlist(import.meta.env.VITE_TIGERS_ALLOWED_ORIGINS)
    .map(origin => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin))

  if (allowedOrigins.length === 0) {
    return { allowed: true }
  }

  const context = readTigersEmbedContext()
  if (!context.embed) {
    return { allowed: true }
  }

  if (context.parentOrigin === '*') {
    return { allowed: false, reason: '埋め込み元のストアを確認できませんでした。' }
  }

  if (allowedOrigins.includes(context.parentOrigin.toLowerCase())) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: 'このストアではタイガースエディタを利用できません。',
  }
}

export function tigersCommerceHeaders(): Record<string, string> {
  const context = readTigersEmbedContext()
  const headers: Record<string, string> = {
    'X-Decocom-Editor-Mode': 'tigers',
  }

  if (context.shopDomain) {
    headers['X-Decocom-Shop-Domain'] = context.shopDomain
  }
  if (context.parentOrigin !== '*') {
    headers['X-Decocom-Shop-Origin'] = context.parentOrigin
  }

  return headers
}
