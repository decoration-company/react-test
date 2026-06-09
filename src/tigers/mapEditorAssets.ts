import type { EditorAssetRecord } from '../api/editorAssets'
import type { TigersBackground, TigersStamp } from './tigersTypes'

function readNumber(meta: Record<string, unknown>, key: string, fallback: number): number {
  const value = meta[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readString(meta: Record<string, unknown>, key: string, fallback = ''): string {
  const value = meta[key]
  return typeof value === 'string' ? value : fallback
}

export function mapEditorAssetToTigersStamp(asset: EditorAssetRecord): TigersStamp {
  const width = readNumber(asset.meta, 'width', 800)
  const height = readNumber(asset.meta, 'height', 800)
  const endSaleRaw = asset.meta.end_sale_date
  return {
    id: readString(asset.meta, 'external_id', asset.id),
    imagePath: asset.display_url,
    width,
    height,
    aspectRatio: width > 0 && height > 0 ? width / height : 1,
    endSaleDate: typeof endSaleRaw === 'string' ? endSaleRaw : null,
  }
}

export function mapEditorAssetToTigersBackground(asset: EditorAssetRecord): TigersBackground {
  const surfaceRaw = readString(asset.meta, 'surface', 'smartphone')
  const surface = surfaceRaw === 'diary' ? 'diary' : 'smartphone'
  const externalId = readString(asset.meta, 'external_id', asset.id)
  const imagePath = asset.display_url || null
  return {
    id: externalId,
    name: asset.name || externalId,
    cssClass: readString(asset.meta, 'css_class', `bg-${externalId}`),
    imagePath: externalId === 'transparent' ? null : imagePath,
    surface,
  }
}
