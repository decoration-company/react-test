import { useEffect, useMemo, useState } from 'react'

import { fetchEditorAssetsCatalog, resolveEditorAssetsShopDomain } from '../api/editorAssets'
import { tigersBackgrounds, tigersStampsOnSale } from './tigersData'
import {
  mapEditorAssetToTigersBackground,
  mapEditorAssetToTigersStamp,
} from './mapEditorAssets'
import type { TigersBackground, TigersCaseKind, TigersStamp } from './tigersTypes'

type CatalogState = {
  stamps: TigersStamp[]
  backgrounds: TigersBackground[]
  source: 'static' | 'api'
  loading: boolean
  error: string | null
}

const INITIAL: CatalogState = {
  stamps: tigersStampsOnSale(),
  backgrounds: tigersBackgrounds,
  source: 'static',
  loading: false,
  error: null,
}

export function useTigersCatalog(_caseKind: TigersCaseKind): CatalogState {
  const [state, setState] = useState<CatalogState>(INITIAL)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!import.meta.env.VITE_COMMERCE_API_BASE_URL) {
        return
      }
      setState((current) => ({ ...current, loading: true, error: null }))
      try {
        const assets = await fetchEditorAssetsCatalog('tigers', resolveEditorAssetsShopDomain())
        if (cancelled) {
          return
        }
        const stamps = assets
          .filter((asset) => asset.type === 'stamp' && asset.enabled)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(mapEditorAssetToTigersStamp)
        const backgrounds = assets
          .filter((asset) => asset.type === 'background' && asset.enabled)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(mapEditorAssetToTigersBackground)

        if (stamps.length === 0 && backgrounds.length === 0) {
          setState({ ...INITIAL, loading: false, source: 'static' })
          return
        }

        setState({
          stamps: stamps.length > 0 ? stamps : tigersStampsOnSale(),
          backgrounds: backgrounds.length > 0 ? backgrounds : tigersBackgrounds,
          source: 'api',
          loading: false,
          error: null,
        })
      } catch (error) {
        if (cancelled) {
          return
        }
        setState({
          stamps: tigersStampsOnSale(),
          backgrounds: tigersBackgrounds,
          source: 'static',
          loading: false,
          error: error instanceof Error ? error.message : 'catalog load failed',
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const backgroundsForCase = useMemo(
    () => state.backgrounds.filter((background) => background.surface === 'smartphone'),
    [state.backgrounds],
  )

  return {
    ...state,
    backgrounds: backgroundsForCase,
  }
}
