# Tigers editor migration survey

作成日: 2026-05-10
対象: `decocom_flutter` の阪神タイガース専用カスタマイザーを `decocom_editor` へ移植するための Phase 1/2 調査メモ。

## 前提

- Flutter版がリファレンス。見た目・操作フロー・保存データを優先して合わせる。
- 現Flutter版は自由配置エディタではなく、3ステップの選択式カスタマイザー。
- スタンプの移動・拡縮・回転・レイヤー順はユーザー操作ではなく、`StampLayout` 定義で固定される。
- タイガース素材はIPライセンス品。阪神コラボ商品の用途に限定して扱う。
- `decocom_editor` の起動コマンドは `npm run dev`、通常ポートは 5173。
- `.env` 既存時に `cp .env.example .env` はしない。

## Phase 1: Flutter側調査

### 実装場所

主要ファイル:

```text
decocom_flutter/lib/new_ui/tigers/
  tigers_case_customizer_page.dart      # 3ステップの編集画面
  tigers_design_view.dart               # ケースプレビューと印刷対象ビュー
  tigers_preview_page.dart              # 完成確認、画像生成、カート投入
  tigers_select_item_modal.dart         # 機種・素材・カラー選択モーダル
  tigers_stamps_grid_view.dart          # スタンプグリッド
  tigers_pattern_settings.dart          # パターン配置計算
  data/
    tigers_stamps.dart                  # スタンプ定義
    tigers_stamp_background.dart        # 背景定義
    tigers_stamp_layouts.dart           # レイアウト定義
  models/
    tigers_design.dart                  # 保存用SimpleDesign
  providers/
    tigers_provider.dart                # 画面間受け渡し用Riverpod StateProvider
```

遅延ロード:

```text
decocom_flutter/lib/screen/
  deferred_tigers_case_customizer_page_loader.dart
  deferred_tigers_preview_page_loader.dart
  deferred_tigers_collab_page_loader.dart
  deferred_tigers_gallery_screen_loader.dart
  deferred_tigers_lp_page_loader.dart
```

関連GraphQL:

```text
decocom_flutter/lib/data/graphql/tigers/tigers.graphql
```

### ルーティングと起動経路

ルート定義:

```text
decocom_flutter/lib/routes.dart
  /collaboration/tigers
  /tigers-collab/customizer
  /tigers-collab/preview
  /tigers-gallery
  /lp/tigers
```

`decocom_flutter/lib/router.dart`:

- `/collaboration/tigers` からコラボトップを表示。
- `customizer` または `/tigers-collab/customizer` で `DeferredTigersCaseCustomizerPageLoader` を表示。
- `/tigers-collab/preview` は `tigersProvider` に `design` と `item` がある場合に `DeferredTigersPreviewPageLoader` を表示。
- `shareCode` + `modelId` クエリがある場合は `TigersPreviewDeepLinkLoader` 経由。
- `tigersProvider` が空で direct preview できない場合は `/collaboration/tigers` へ戻す。

画面遷移:

```text
/collaboration/tigers
  -> /tigers-gallery または /tigers-collab/customizer
  -> TigersSelectItemModal で商品選択
  -> STEP 1 スタンプ選択
  -> STEP 2 レイアウト選択
  -> STEP 3 背景選択
  -> /tigers-collab/preview
  -> 画像生成、DB保存、カート投入
```

### コンポーネント構成

```text
TigersCaseCustomizerPage
  ├─ Header
  │   ├─ 戻る
  │   ├─ STEP n
  │   └─ 3ステップインジケータ
  ├─ PreviewArea
  │   ├─ SelectedCaseInfoRibbon
  │   ├─ STEP 1: StampPreviewFull
  │   └─ STEP 2/3: TigersDesignView
  └─ SelectionArea
      ├─ STEP 1: TigersStampsGridView + _StampItem
      ├─ STEP 2: _LayoutOption + _StampSlot + _AdditionalStampItem
      └─ STEP 3: _BackgroundOption

TigersDesignView
  ├─ MaskView(frameImageUrl)
  ├─ print area RepaintBoundary
  │   ├─ caseColor
  │   ├─ background image
  │   └─ stamps by layout
  └─ MaskView(frameImageLogoMaskUrl fallback frameImageMaskUrl)

TigersPreviewPage
  ├─ TigersDesignView(thumbnailImageKey, printImageKey)
  ├─ 商品情報カード
  ├─ ギャラリー投稿チェックボックス
  └─ カートに入れる
```

### レスポンシブ構造

`TigersCaseCustomizerPage` の `LayoutBuilder` で `constraints.maxWidth >= 768` をPC判定。

- PC:
  - `Row`
  - STEP 1 は左 `flex: 3`、右 `flex: 5`
  - STEP 2/3 は左 `flex: 1`、右 `flex: 1`
  - 左セクション右端に `#DDDDDD` border
- Mobile:
  - `Column`
  - 左プレビューは固定高
  - STEP 1 は 280px、STEP 2/3 は 420px
  - 右セクションが残り高さ

### UI定数

Flutter側の主な値:

```text
ThemeSize.spacingXXS = 4
ThemeSize.spacingXS  = 8
ThemeSize.spacingS   = 16
ThemeSize.spacingM   = 24
ThemeSize.spacingL   = 32
ThemeSize.mainButtonHeight = 48

NewUIColorsTigers.primaryColor = #FFE500
NewUIColorsTigers.borderColor  = #DDDDDD
NewUIColorsTigers.bgColor      = #FAFAFA
NewUIColors.selectedBgColor    = #FFFBEF
NewUIColors.bgColorVeryLight   = #F0F0F0
NewUIColors.mockupBorderColor  = #333333
NewUIColors.activeSlotColor    = #FF6600
NewUIColors.textPrimary        = #212121
NewUIColors.textSecondary      = #757575
```

主要サイズ:

```text
Header padding: horizontal 16, vertical 12
Header back button: 36 x 36, icon 20
STEP title: 18px bold
Step active indicator: 32 x 12
Step inactive indicator: 12 x 12
Preview desktop padding: 20
Preview mobile padding: horizontal 16, vertical 24
Stamp grid: 3 columns, gap 12, horizontal padding 20
Stamp image in grid: 100 x 100
Footer button area: padding 20 8 20 12
Footer button height: 48, radius 10
Layout option: 70 x 130, radius 18
Layout selected border: 4
Layout unselected border: 3
Stamp slot: 60 x 60, radius 10
Additional stamp image: 96 x 96
Background option: 70 x 130, radius 18
Preview page design height: 260 if width < 380, otherwise 280
```

### 素材

Flutter assets:

```text
decocom_flutter/assets/tigers/
  tigers_sample_image.png
  tigers-back/
    tigers_back_case1.png
    tigers_back_case2.png
    tigers_back_case3.png
    tigers_back_case4.png
    tigers_back_case5.png
    tigers_back_diary1.png
    tigers_back_diary2.png
    tigers_back_diary3.png
    tigers_back_diary4.png
    tigers_back_diary5.png
  tigers-stamp/
    tigers-stamp-01.png
    ...
    tigers-stamp-15.png
```

背景カテゴリ:

| 種別 | ID | 名前 | 画像 |
|---|---|---|---|
| smartphone | `transparent` | 透明 | なし |
| smartphone | `case1` | 黒 | `tigers_back_case1.png` |
| smartphone | `case2` | 黄色 | `tigers_back_case2.png` |
| smartphone | `case3` | 白ストライプ | `tigers_back_case3.png` |
| smartphone | `case4` | 黄色×黒バイカラー | `tigers_back_case4.png` |
| smartphone | `case5` | 黄色×黒ボーダー | `tigers_back_case5.png` |
| diary | `diary1` | 黒 | `tigers_back_diary1.png` |
| diary | `diary2` | 黄色 | `tigers_back_diary2.png` |
| diary | `diary3` | 白ストライプ | `tigers_back_diary3.png` |
| diary | `diary4` | 黄色×黒バイカラー | `tigers_back_diary4.png` |
| diary | `diary5` | 黄色×黒ボーダー | `tigers_back_diary5.png` |

画像サイズ:

```text
case backgrounds: 1668 x 3502
diary backgrounds: 3334 x 2334
tigers_sample_image.png: 1049 x 1568
```

スタンプサイズ:

| ID | ファイル | サイズ | 販売状態 |
|---|---|---:|---|
| `1` | `tigers-stamp-01.png` | 831 x 557 | 販売中 |
| `2` | `tigers-stamp-02.png` | 844 x 849 | 販売中 |
| `3` | `tigers-stamp-03.png` | 841 x 850 | 販売中 |
| `4` | `tigers-stamp-04.png` | 849 x 318 | 販売中 |
| `5` | `tigers-stamp-05.png` | 852 x 870 | 販売中 |
| `6` | `tigers-stamp-06.png` | 859 x 838 | 販売中 |
| `7` | `tigers-stamp-07.png` | 852 x 820 | 販売中 |
| `8` | `tigers-stamp-08.png` | 862 x 396 | 販売中 |
| `9` | `tigers-stamp-09.png` | 860 x 497 | 販売中 |
| `10` | `tigers-stamp-10.png` | 858 x 493 | 販売中 |
| `11` | `tigers-stamp-11.png` | 874 x 503 | 販売中 |
| `12` | `tigers-stamp-12.png` | 858 x 285 | 販売中 |
| `13` | `tigers-stamp-13.png` | 852 x 296 | 販売中 |
| `14` | `tigers-stamp-14.png` | 797 x 850 | 2025-12-31 23:59:59 まで |
| `15` | `tigers-stamp-15.png` | 797 x 850 | 販売中 |

注意: 現在日付 2026-05-10 時点では `14` は `tigersStampsOnSale` から除外される。

### レイアウト定義

`data/tigers_stamp_layouts.dart`:

| ID | 名前 | stampCount | 配置 | サイズ比率 | 角度 |
|---|---|---:|---|---|---|
| `center` | 中央スタンプ | 1 | center | 0.7 | 0 |
| `bottom-right` | 右下ワンポイント | 1 | bottomRight, right 12, bottom 2 | 0.45 | -20 |
| `double` | 中央＋右下ダブル | 2 | center + bottomRight | 0.7, 0.45 | 0, -20 |
| `pattern` | パターン | 1 | タイル敷き | 計算式 | 0 |

パターン計算:

```text
stampSizeOneSide = designArea.width / 3
stampSize = aspect比を維持
patternSourceSize = stampSize * 0.8
patternGap = max(patternSourceSize.width, patternSourceSize.height) * 1.1
```

### 編集中状態

`TigersCaseCustomizerPage` の状態:

```text
currentStep: TigersCaseCustomizerStep
selectedItem: GTigersItemsV2Data_itemsV2?
selectedStamps: Stamp[]
selectedLayout: StampLayout?
selectedBackground: StampBackground?
isAllInitiallySelected: bool
```

STEP 2 の追加スタンプ選択中スロット:

```text
currentSelectedStampIndex: int
```

画面間受け渡し:

```dart
final tigersProvider = StateProvider<({TigersDesign design, GTigersItemsV2Data_itemsV2? item})?>(...)
```

### 保存形式

`TigersDesign` は `SimpleDesign` を継承し、既存 `List<DesignItem>` 相当の保存形式に合わせて、`state` 配列でラップする。

例:

```json
{
  "state": [
    {
      "layout": "double",
      "stamps": "2,5",
      "background": "case3",
      "type": "simpleDesign"
    }
  ]
}
```

保存対象:

```text
layout: layout.id
stamps: stamp.id をカンマ結合
background: background.id
type: simpleDesign
```

保存時フロー:

```text
TigersPreviewPage
  -> ThumbnailImageService.export(...)
  -> PrintImageService.export(...)
  -> DesignClass.provider.saveToDb(..., partnerProjectId: PartnerProject.tigers.value, designData: selectedDesign.toJson())
  -> CartViewModel.addItem(...)
  -> 任意で shareDesignsProvider.create(...)
```

`PrintImageService.export` には `printSize`、`caseColor`、`frameClipSvgUrl` を渡す。

### 商品データ

`tigers.graphql` の `TigersItemV2Fragment` が必要とする主なフィールド:

```text
id
alias
homeImageUrl
frameImageUrl
frameImageMaskUrl
frameImageLogoMaskUrl
frameImageCropWidth / frameImageCropHeight
frameImageWidth / frameImageHeight
frameImageMaskWidth / frameImageMaskHeight
material { id name }
price { id value }
color { id name }
model { id name }
maruiorimonoParameter {
  imageOriginalWidth
  imageOriginalHeight
  frameClipSvg
  frameClipSvgUrl
}
```

`TigersDesignView` のサイズ計算:

- `tigersItemPrintSize`: `maruiorimonoParameter.imageOriginalWidth/Height` があればそれを使用。なければ `frameImageWidth/Height`。
- `tigersItemMaskSize`: `frameImageMaskWidth/Height` があればそれを使用。なければ print size + crop * 2。
- `previewScale = height / maskSize.height`
- `width = height * (maskSize.width / maskSize.height)`
- 印刷エリアは `printSize` と crop から `contentWidth/Height`、padding を算出。

### UIスクショ確認ポイント

実装後にFlutter版と side-by-side で比較する箇所:

1. `/tigers-collab/customizer` STEP 1 初期状態: ヘッダー、黄色背景、薄いデフォルトスタンプ、3列グリッド。
2. STEP 1 スタンプ選択後: 選択枠、チェックバッジ、次へボタン活性。
3. STEP 2 `center`: 左プレビューのケース合成、レイアウトカード選択状態。
4. STEP 2 `double`: 追加スタンプスロット、追加グリッド、2つ目スタンプの透過/選択後表示。
5. STEP 2 `pattern`: パターン密度、タイル間隔。
6. STEP 3 背景選択: 70 x 130 の背景サムネイル、選択ドット、背景名。
7. `/tigers-collab/preview`: 280px前後のプレビュー、商品情報カード、投稿チェック、カートボタン。
8. PC幅 768px 以上: STEPごとの左右 `flex` 比率。
9. Mobile幅 380px未満: preview height 260、テキスト折り返し、下部ボタン。

## Phase 2: decocom_editor側調査

### 現状アーキテクチャ

`decocom_editor` は Vite + React + TypeScript。ルーティングライブラリはなく、`src/App.tsx` が `window.location` を直接見て分岐している。

```text
decocom_editor/src/
  main.tsx
  App.tsx
  App.css
  index.css
  api/commerce.ts
  pixel9a/
  verify/
  test/
```

現状ルート:

- `/test/render` -> `RenderTestPage`
- `?mode=verify&variant=...` -> `VerifyPreview`
- その他 -> `Pixel9aCaseMaskPreview`

API:

- `src/api/commerce.ts`
- `uploadImage(file)` -> `POST /api/upload`
- `renderProductVariant(variant, payload)` -> `POST /api/products/{variant}/render`
- `renderDesign(payload)` -> 旧 `POST /api/skia/render`

postMessage:

```ts
{
  type: 'decocom:design:ready',
  variant,
  preview_url,
  print_image_url
}
```

### 組み込み案

推奨ルート:

```text
/tigers?variant=...&embed=shopify&origin=...
```

理由:

- `App.tsx` の既存分岐に最小追加できる。
- 汎用editorや verify mode と衝突しない。
- 阪神コラボ専用UIであることがURLから明確。

代替:

```text
/?mode=tigers&variant=...
```

ただしURLを見たときに専用画面だと分かりづらく、将来 `/admin` / `/editor` 分割時も `/tigers` のほうが移設しやすい。

### 実装配置案

```text
decocom_editor/src/tigers/
  TigersEditor.tsx
  TigersEditor.css
  TigersDesignPreview.tsx
  tigersAssets.ts
  tigersData.ts
  tigersTypes.ts
  tigersDesignSerialization.ts
```

assets:

```text
decocom_editor/public/assets/tigers/
  tigers_sample_image.png
  tigers-back/
  tigers-stamp/
```

`public/` 配下に置く理由:

- Flutter版と同じ相対パス構造に寄せやすい。
- Vite の import 対象にせず、ライセンス素材を明示的な静的配信領域として扱える。
- `'/assets/tigers/...'` でデータ定義から参照しやすい。

コードコメントには「阪神タイガースコラボ商品用途に限定」と明記する。

### 商品/spec連携案

現Flutter版は Alicia GraphQL の `ItemV2` を直接使う。`decocom_editor` は Alicia GraphQL を持たず、ブラウザから Alicia 認証を扱わない方針なので、commerce BFF 経由が自然。

最小実装案:

- URL `variant` を受け取る。
- `GET /api/products/{variant}/print-spec` で `base_image_url` / `print_area_svg_url` / `print_width` / `print_height` を取得する。
- Flutter版の `selectedItem` に必要な見た目情報のうち、commerce print spec で足りない `frameImageUrl` / `frameImageLogoMaskUrl` / `color` / `material` / `price` / `model` をどう渡すかが未確定。

要確認:

1. タイガース用の `variant` はどの単位にするか。
2. `commerce` の product print spec に Flutter版の `frameImageUrl` 相当が入るか。
3. 背景カテゴリは smartphone だけでよいか、diary も初期対応するか。
4. Shopify配布軸ではギャラリー投稿チェックを残すか。

### 保存ロジック案

現時点の指定どおり仮ID:

```ts
const specId = `spec_dev_${Date.now()}`
```

React版の保存データはFlutter互換の `TigersDesign` JSON を維持する。

```ts
type TigersDesignState = {
  layout: string
  stamps: string
  background: string
  type: 'simpleDesign'
}
```

配布軸 postMessage 案:

```ts
{
  type: 'decocom:design:ready',
  variant,
  spec_id: specId,
  design_data: {
    state: [{ layout, stamps, background, type: 'simpleDesign' }]
  },
  preview_url,
  print_image_url
}
```

注意: 既存Shopify連携仕様では `spec_id` と `design_id` は line item properties に含めない決定になっている。今回の「spec_id発行フロー」は配布軸用の別メッセージとして扱うのか、Shopify line item には載せないのか確認が必要。

### 実装前に決めたいこと

1. 移植範囲は「カスタマイザー + プレビュー」までか、「ギャラリー投稿チェック」もUIだけ残すか。
2. 商品選択モーダルを React 側に移植するか、URL `variant` 固定で商品選択は親側に任せるか。
3. `selectedItem` 相当のデータを `commerce` から取得できるAPIを追加するか、初期はモック/固定商品で見た目再現を優先するか。
4. Flutter版にない自由配置操作（移動・拡縮・回転・削除・レイヤー順・undo/redo）を追加しない方針でよいか。
5. `spec_id` を postMessage に含めるか。既存Shopify仕様との整合が必要。

## 次アクション案

ユーザー確認後に Phase 2 設計を確定する。合意できたら以下の順で進める。

1. `/tigers` ルートを追加。
2. `public/assets/tigers/` へ素材コピー。
3. Flutter定義を TypeScript データへ移植。
4. `TigersEditor` の3ステップUIを作る。
5. `TigersDesignPreview` で背景・レイアウト・スタンプ合成を再現。
6. 保存データを Flutter互換JSONで生成。
7. `npm run dev` で起動し、Flutter版と side-by-side 比較。
