import { useEffect, useMemo } from 'react'
import { type BulkEmbedPlacement, VerifyPreview } from '../verify/VerifyPreview'
import './bulk-embed.css'

function parseInitialPlacement(raw: string | null): BulkEmbedPlacement | null {
  if (!raw?.trim()) return null
  try {
    const p = JSON.parse(raw) as BulkEmbedPlacement
    if (
      typeof p.centerX !== 'number' ||
      typeof p.centerY !== 'number' ||
      typeof p.imageWidth !== 'number' ||
      typeof p.imageHeight !== 'number' ||
      typeof p.scale !== 'number' ||
      typeof p.rotationRad !== 'number'
    ) {
      return null
    }
    return p
  } catch {
    return null
  }
}

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
  const designName = params.get('design_name')?.trim() || null
  const deviceName = params.get('device')?.trim() || variant || '商品'
  const parentOrigin = resolveParentOrigin(params.get('origin'))
  const placementRaw = params.get('placement')
  const initialPlacement = useMemo(
    () => parseInitialPlacement(placementRaw),
    [placementRaw],
  )

  useEffect(() => {
    document.documentElement.classList.add('bulk-embed')
    return () => document.documentElement.classList.remove('bulk-embed')
  }, [])

  if (!variant) {
    return (
      <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <p>variant パラメータが必要です。</p>
      </main>
    )
  }

  return (
    <main
      style={{
        margin: 0,
        padding: 0,
        height: '100%',
        overflow: 'hidden',
        background: '#f6f6f7',
      }}
    >
      <VerifyPreview
        variant={variant}
        embedBulk={{
          parentOrigin,
          deviceName,
          initialDesignUrl: designUrl,
          designLabel: designName,
          initialPlacement,
        }}
      />
    </main>
  )
}
