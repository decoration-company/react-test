import { useEffect, useMemo, useState } from 'react'
import { fetchPrintSpec, type PrintSpec } from '../api/commerce'
import { resolveRemoteAssetUrl } from '../lib/resolveRemoteAssetUrl'
import { resolveTigersItem } from './tigersData'
import type { TigersMockItem } from './tigersTypes'

export function mergeTigersItemWithPrintSpec(item: TigersMockItem, spec: PrintSpec): TigersMockItem {
  const baseImageUrl = spec.print_spec.base_image_url?.trim()
  return {
    ...item,
    modelName: spec.device.name || item.modelName,
    materialName: spec.product_type.name || item.materialName,
    printWidth: spec.print_spec.print_width || item.printWidth,
    printHeight: spec.print_spec.print_height || item.printHeight,
    commerceBaseImageUrl: baseImageUrl ? resolveRemoteAssetUrl(baseImageUrl) : null,
  }
}

export function useTigersPrintSpec(variant: string | null) {
  const baseItem = useMemo(() => resolveTigersItem(variant), [variant])
  const [item, setItem] = useState<TigersMockItem>(baseItem)
  const [printSpec, setPrintSpec] = useState<PrintSpec | null>(null)
  const [specLoading, setSpecLoading] = useState(false)
  const [specError, setSpecError] = useState<string | null>(null)

  useEffect(() => {
    setItem(baseItem)
    setPrintSpec(null)
    setSpecError(null)

    let cancelled = false
    setSpecLoading(true)

    fetchPrintSpec(baseItem.variant)
      .then(spec => {
        if (cancelled) return
        setPrintSpec(spec)
        setItem(mergeTigersItemWithPrintSpec(baseItem, spec))
      })
      .catch(err => {
        if (cancelled) return
        setSpecError(err instanceof Error ? err.message : '印刷仕様の取得に失敗しました')
      })
      .finally(() => {
        if (!cancelled) setSpecLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [baseItem])

  return { item, printSpec, specLoading, specError }
}
