import { VerifyPreview } from '../verify/VerifyPreview'

function resolveParentOrigin(raw: string | null): string {
  if (!raw || raw === '*') return '*'
  try {
    return new URL(raw).origin
  } catch {
    return '*'
  }
}

export function BulkCellEmbed() {
  const params = new URLSearchParams(window.location.search)
  const variant = params.get('variant')?.trim()
  const designUrl = params.get('design_url')?.trim() || null
  const deviceName = params.get('device')?.trim() || variant || '商品'
  const parentOrigin = resolveParentOrigin(params.get('origin'))

  if (!variant) {
    return (
      <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <p>variant パラメータが必要です。</p>
      </main>
    )
  }

  return (
    <main style={{ margin: 0, padding: 0, minHeight: '100vh', background: '#f6f6f7' }}>
      <VerifyPreview
        variant={variant}
        embedBulk={{
          parentOrigin,
          deviceName,
          initialDesignUrl: designUrl,
        }}
      />
    </main>
  )
}
