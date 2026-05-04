# decocom_editor 現状調査

**調査日**: 2026年5月4日

調査の前提: ワークスペース `/Users/tokuhiroyui/decocom/decocom_all/decocom_editor`。併読: `decocom_commerce`（Skia 同期レンダー・Pixel 9a 定数・Alicia クライアントの有無の確認）。

---

## 1. リポジトリ構成

### ルート構成

| ファイル | 役割 |
|----------|------|
| `package.json` | 依存は `react` / `react-dom` のみ。スクリプト: `dev`（Vite）、`build`（`tsc -b && vite build`）、`lint`、`preview` |
| `vite.config.ts` | `@vitejs/plugin-react`。`server.allowedHosts` に `.ngrok-free.dev` / `.trycloudflare.com`（iframe 用トンネル想定） |
| `tsconfig.json` | `tsconfig.app.json` / `tsconfig.node.json` への project references |
| `tsconfig.app.json` | `src` のみ include、`jsx: react-jsx` |
| `.env.example` | `VITE_COMMERCE_API_BASE_URL=http://localhost:8000` のみ |
| `README.md` | 起動・Shopify embed・commerce 連携の説明 |
| `index.html` | `src/main.tsx` を読み込み |

ルートに `AGENTS.md` は無い（decocom_all ルートの `AGENTS.md` が全体方針）。

### `src` 配下の主要モジュール

- `src/main.tsx` — `App` を `#root` にマウント
- `src/App.tsx` — `Pixel9aCaseMaskPreview` のみ描画
- `src/api/commerce.ts` — commerce REST（`uploadImage` / `renderDesign`）
- `src/pixel9a/` — Pixel 9a 専用 UI・定数・座標変換
- `src/vite-env.d.ts` — `VITE_COMMERCE_API_BASE_URL` の型

**未実装（ロードマップ上の像との差）**: `/editor`・`/admin` のルーティング分割、`react-router` 等は現コードベースに無い。

### 使用ライブラリ

- **GraphQL クライアント**: なし
- **HTTP**: ブラウザ標準 `fetch`（`src/api/commerce.ts`）
- **状態管理**: React フックのみ（外部ストアなし）

### ビルド・起動

- 開発: `npm run dev`（README: 通常 `http://localhost:5173`）
- ビルド: `npm run build` → `npm run preview`
- Lint: `npm run lint`

### 環境変数一覧（editor が参照）

| 変数 | 参照箇所 | 用途 |
|------|-----------|------|
| `VITE_COMMERCE_API_BASE_URL` | `src/api/commerce.ts` の `commerceBaseUrl()`、`src/vite-env.d.ts` | commerce API ベース URL（未設定時は `throw`） |

`decocom_commerce` の `EDITOR_ORIGIN`（CORS）は editor 内では未参照。

### iframe 埋め込み

- **親 → 子（postMessage 受信）**: なし（`message` リスナー未実装）
- **子 → 親**: `src/pixel9a/Pixel9aCaseMaskPreview.tsx` — `window.parent.postMessage(message, parentOrigin)`
- **URL クエリ**: `embeddedParentOrigin()` — `origin` または `parent_origin` で `postMessage` の宛先 origin。`isShopifyEmbedUrl()` — `embed=shopify` または `platform=shopify`
- **メッセージ型**: `type: 'decocom:design:ready'`、`spec_id` / `design_id` / `preview_url` / `composed_image_url`

---

## 2. データ取得経路

### 機種データ

| 項目 | 現状 |
|------|------|
| 機種一覧 / 詳細 | **取得なし**。Pixel 9a 固定 |
| アリシア GraphQL | **editor 内に無い**（エンドポイント・クエリ定義なし） |
| 機種識別キー | `src/pixel9a/transform.ts` — 定数 `PIXEL_9A_DEVICE_ID`（`'pixel-9a'`）。`createRenderPayload()` が `Pixel9aRenderPayload.device` に設定 |
| クリップ path（`caseClipSvgPathData` 相当） | **定数** `src/pixel9a/constants.ts` の `PIXEL_9A_CASE_CLIP_PATH_D`。適用: `src/pixel9a/Pixel9aCaseMaskPreview.tsx` の `<clipPath>` / 同 path の fill |

**参考（editor 外）**: `decocom_commerce/app/alicia/client.py` の `AliciaClient.list_case_models()` が GraphQL `caseModels` を叩く例。**現行 editor は未使用**。

### 印刷データ

| 概念 | 現状 |
|------|------|
| print_area 相当 | `src/pixel9a/transform.ts` の `Pixel9aDesignArea` / `PIXEL_9A_DESIGN_AREA`（`PIXEL_9A_CASE_CLIP_PATH_BOUNDS` と同寸法） |
| print_width / print_height | プレビューは上記 user 空間。出力ピクセルは editor 未保持 → commerce `app/devices/pixel_9a.py` の `OUTPUT_WIDTH_PX` / `OUTPUT_HEIGHT_PX` および `app/api/skia.py` の `post_sync_render` |
| base_image / safe_area / bleed_area | editor に専用 URL・レイヤーなし。白ベースは SVG fill。bleed は commerce 側 `include_bleed: True` |

### SVG・画像 URL

- ユーザー画像: `URL.createObjectURL` → `uploadImage()` 後の `source_image_url` を payload に
- マスク path: URL 取得なし（定数）

### 呼び出しフロー

**非 Shopify embed**（`Pixel9aCaseMaskPreview.tsx` の `onSave`）:

1. `uploadImage(selectedFile)` — `src/api/commerce.ts` → `POST /api/upload`
2. `renderDesign(createRenderPayload(...))` — 同ファイル → `POST /api/skia/render`、body は `createRenderPayload()`（`src/pixel9a/transform.ts`）

**Shopify embed**: commerce は呼ばず `postMessage` のみ。

起動時のマスタ一括取得: なし。

### 親からの初期値の境界

URL では主に `origin` / `parent_origin` / `embed` / `platform`。機種・印刷マスタは editor 内定数のみ。

---

## 3. 表示・利用ロジック

- **クリップ適用**: `Pixel9aCaseMaskPreview.tsx` の SVG `viewBox` + `<clipPath>` + 画像 `<g clipPath=...>`
- **座標**: プレビューは `clientPointToSvgPoint()`（`src/pixel9a/transform.ts`）。サーバー向けは `transformToDesignItemPayload()` → `createRenderPayload()`。別 DPI の明示変換レイヤーは無し。

### Issue #1840 / MockupCompositor / useUnifiedMockupPipeline

**本リポジトリに該当コードなし**。別リポジトリ・Issue 参照の可能性あり。`decocom_flutter` 全体への `grep` は大規模で一度タイムアウト／失敗しており、Flutter 側の有無は未確定。

### Pixel 9a ハードコード箇所

- `src/pixel9a/constants.ts`
- `src/pixel9a/transform.ts`（`PIXEL_9A_DEVICE_ID`、`PIXEL_9A_DESIGN_AREA` 等）
- `src/App.tsx`（Pixel 9a コンポーネント直結）
- 対になる commerce: `decocom_commerce/app/devices/pixel_9a.py`、`app/api/skia.py`（`device: Literal["pixel-9a"]` のみ）

---

## 4. commerce 切替に向けた改修ポイント

### 抽象化レイヤー

現状なし。自然な挿入点: `src/api/` に spec 取得＋正規化型、`pixel9a/` の定数依存を段階的に props / 設定オブジェクトへ。

### フォールバック判定（commerce → アリシア）

editor 現状は単一路線。判定は **commerce BFF** に寄せ、editor は commerce のみ叩く形が自然（Alicia 認証をブラウザに載せないため）。

### フィールドマッピング表（想定 `product_print_specs` ↔ 現状）

| commerce 想定 | 現状 editor |
|-----------------|-------------|
| `print_area_svg_url` | `PIXEL_9A_CASE_CLIP_PATH_D`（定数） |
| `base_image_url` | 無（SVG fill） |
| `safe_area_svg_url` | 無 |
| `bleed_area_svg_url` | 無（サーバ bleed） |
| `print_width` / `print_height` | `PIXEL_9A_DESIGN_AREA` と一致する数値（単位整合は要設計） |

### 識別キー対応

現状は `pixel-9a` のみ。commerce `products.variant`（例 `iphone-17-grip-case`）を主キーにし、クエリ or postMessage で渡す案。

### iPhone 17 グリップ検証の最小案

- URL 等で `variant` を受け取る
- commerce から spec を GET
- クリップ path / design_area を props 化した汎用プレビューに差し替え
- `POST /api/skia/render` の `device` 拡張は commerce 側とセット

---

## 5. 不明点・要確認事項

1. 「editor はアリシア GraphQL から」は **現行本リポジトリでは当てはまらない**（別ブランチ・別アプリの可能性）。
2. editor と commerce の `CASE_CLIP_PATH_D` の **完全一致**は未検証。
3. MockupCompositor / Issue #1840 は **本 repo 外**の可能性が高い。
4. 親から SKU・ハンドル等を渡す **postMessage 受信**は未実装。
