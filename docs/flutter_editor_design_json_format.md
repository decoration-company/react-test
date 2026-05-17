# Flutter / editor デザイン保存JSON比較

作成日: 2026-04-30

旧方針として廃止: このドキュメント内の `alicia_item_id` を commerce/editor の新規識別子として使う前提は廃止。最新の商品SKU識別方針は `decocom_commerce/docs/product_master_implementation_plan.md` の `variant` 方針を参照。Alicia 側の既存保存データでは数値 `itemId` が残るが、新規の Shopify line item properties / Variant Metafield のキーは `variant` に統一する。

## 目的

`decocom_flutter`（package name: `designcase_flutter`）で保存しているデザインJSONを調査し、`decocom_editor`（React）と共通化できるか、または変換層が必要かを判断する。

結論は **パターンC: 根本から違うため、共通スキーマ新設または変換層が必須**。

ただし、Pixel 9a の単一画像を `commerce /api/skia/render` に渡すための item payload だけを見ると、editor 側は Flutter の `DesignItem.toMap()` のサブセットにかなり近い。

## 参照コード

- Flutter 保存/読み込み entry point: `decocom_flutter/lib/design/services/design_data_service.dart`
- Flutter item serializer: `decocom_flutter/packages/decocom_core/lib/models/design_item.dart`
- Flutter text serializer: `decocom_flutter/packages/decocom_core/lib/models/text_item.dart`
- Flutter ローカルDB: `decocom_flutter/lib/data/db/drift/tables.dart`
- Flutter GraphQL 保存: `decocom_flutter/lib/data/db/repositories/graphql_repository.dart`
- Flutter GraphQL schema: `decocom_flutter/lib/data/graphql/db/db.graphql`
- editor Pixel 9a transform: `decocom_editor/src/pixel9a/transform.ts`

## Flutter側JSON仕様

Flutter の保存JSONはトップレベルが固定で、`state` 配列に `DesignItem.toMap()` の結果を入れる。

```json
{
  "state": [
    {
      "id": "7b4b1e9c-0000-4000-9000-000000000001",
      "sync_id": null,
      "type": "image",
      "top_left_pos_dx": 12.5,
      "top_left_pos_dy": 34.0,
      "angle": 0.25,
      "scale": 1.2,
      "size_width": 160.0,
      "size_height": 213.33,
      "text": "",
      "font_family": "NotoSansJP",
      "text_color": "#ff000000",
      "is_editable_text": false,
      "is_vertical_writing": false,
      "image_local_path": "https://example.com/uploaded-image.png",
      "is_lock": false,
      "stamp_color": null,
      "svg_url": null,
      "flip_x": false,
      "flip_y": false,
      "design_size_width": 207.87,
      "design_size_height": 441.93,
      "preset_color_filter_name": null,
      "design_frame": null,
      "paid_item": null,
      "is_pattern": false,
      "pattern_gap": null,
      "pattern_source_size": null,
      "stamp_aspect_ratio": null,
      "text_item": null,
      "scale_alignment": "topLeft",
      "restrictions": []
    }
  ]
}
```

### 共通フィールド

| field | 型 | 単位/値 | 意味 |
|---|---:|---|---|
| `id` | string | UUID | DesignItem ID |
| `sync_id` | string/null | - | 同期用ID。通常 item 単位では null が多い |
| `type` | string | enum | `background`, `backgroundColor`, `image`, `stamp`, `myStamp`, `svg`, `text`, `frame` |
| `top_left_pos_dx` | number | 論理px | アイテム左上X座標 |
| `top_left_pos_dy` | number | 論理px | アイテム左上Y座標 |
| `angle` | number | ラジアン | 回転角 |
| `scale` | number | 倍率 | アイテム拡大率 |
| `size_width` | number | 論理px | scale前の幅 |
| `size_height` | number | 論理px | scale前の高さ |
| `text` | string | - | 旧テキスト仕様の本文 |
| `font_family` | string | - | 旧テキスト仕様のフォント |
| `text_color` | string | ARGB hex | 旧テキスト仕様の色 |
| `is_editable_text` | bool | - | 編集中フラグ |
| `is_vertical_writing` | bool | - | 旧テキスト仕様の縦書きフラグ |
| `image_local_path` | string/null | URL/旧ローカルパス | 画像URL。現在も名前は旧ローカル名のまま |
| `is_lock` | bool | - | ロック状態 |
| `stamp_color` | number/null | Flutter ARGB int | スタンプ着色 |
| `svg_url` | string/null | URL | SVGスタンプURL |
| `flip_x` | bool | - | 左右反転 |
| `flip_y` | bool | - | 上下反転 |
| `design_size_width` | number/null | 論理px | 保存時のデザイン領域幅 |
| `design_size_height` | number/null | 論理px | 保存時のデザイン領域高さ |
| `preset_color_filter_name` | string/null | preset name | カラーフィルター |
| `design_frame` | object/null | - | フォトフレーム情報 |
| `paid_item` | object/null | - | 有料素材情報 |
| `is_pattern` | bool | - | パターン化フラグ |
| `pattern_gap` | object/null | 論理px | パターン間隔 `{ dx, dy }` |
| `pattern_source_size` | object/null | 論理px | パターン元サイズ `{ width, height }` |
| `stamp_aspect_ratio` | number/null | ratio | スタンプ縦横比 |
| `text_item` | object/null | - | 新テキスト仕様 |
| `scale_alignment` | string | `topLeft` | 現行保存は `topLeft` 固定。旧データは null/`center` あり |
| `restrictions` | string[] | ID配列 | 使用制限 |

### テキスト要素

新テキスト仕様は `text_item` に入る。旧仕様として `text`, `font_family`, `text_color`, `is_vertical_writing` も残っている。

```json
{
  "type": "text",
  "top_left_pos_dx": 40,
  "top_left_pos_dy": 120,
  "angle": 0,
  "scale": 1,
  "size_width": 120,
  "size_height": 24,
  "text_item": {
    "text": "Hello",
    "font_size": 24,
    "is_vertical_writing": false,
    "font_color": "#ff000000",
    "text_align": "center",
    "font_weight": 400,
    "font_family": "NotoSansJP",
    "is_wrap": true
  }
}
```

### 有料素材

`paid_item` は有料素材がある場合だけ入る。

```json
{
  "paid_item": {
    "id": "123",
    "name": "resource group name",
    "creatorName": "creator name",
    "price": 100,
    "patternPrice": 300,
    "isPattern": false
  }
}
```

### フォトフレーム

`type: "frame"` の場合は `design_frame` を持つ。

```json
{
  "design_frame": {
    "image_path": "https://example.com/frame-image.png",
    "image_size_width": 1000,
    "image_size_height": 800,
    "frame_clippers": [
      {
        "sync_id": null,
        "svg_url": "https://example.com/clip.svg",
        "size_width": 200,
        "size_height": 200,
        "offset_dx": 0,
        "offset_dy": 0,
        "angle": 0,
        "scale": 1,
        "image_sync_id": null,
        "image_path": "https://example.com/user-image.png",
        "image_width": 1000,
        "image_height": 800,
        "image_offset_dx": 0,
        "image_offset_dy": 0,
        "image_scale": 1,
        "image_angle": 0
      }
    ]
  }
}
```

## 保存先

### ローカル

Flutter は Drift/SQLite の `designs` テーブルに保存する。

主なカラム:

| column | 意味 |
|---|---|
| `_id` | ローカルPK |
| `sync_id` | サーバー同期ID |
| `name` | デザイン名 |
| `thumbnail_image_path` | サムネイルURL/ローカルパス |
| `print_image_path` | 印刷画像URL/ローカルパス |
| `data` | 上記 `{"state":[...]}` JSON文字列 |
| `item_id` | Alicia `ItemV2.id` |
| `app_version` | アプリバージョン |
| `user_id` | ユーザーID |
| `partner_project_id` | 連携パートナープロジェクトID |
| `last_updated_at` | 更新日時 |

### サーバー

ログイン済み・完成保存の場合は GraphQL で Alicia 側の SavedDesign に同期される。

- `createSavedDesign(input: CreateSavedDesignInput!)`
- `updateSavedDesign(syncId: ID!, input: UpdateSavedDesignInput!)`
- 保存JSONは `serializedItems` に文字列として入る
- 商品IDは `itemId: Int!`

### 画像アップロード

画像素材・サムネイル・印刷画像は Alicia API にアップロードされる。

- API: `POST /editor/upload`
- 返却: `data.url`
- 保存JSON内では主に `image_local_path` に URL が入る

## 座標系

Flutter の保存座標は、デザイン領域内の左上原点の論理px。

- 原点: 左上
- 位置: `top_left_pos_dx`, `top_left_pos_dy`
- サイズ: `size_width`, `size_height`
- 拡縮: `scale`
- 回転: `angle` ラジアン
- z-order: `state` 配列順。後ろの item ほど前面
- canvas: itemごとの `design_size_width`, `design_size_height`

旧データ互換として `scale_alignment` が `center` または null の場合は、読み込み時に `topLeftPos` を補正している。現行保存は `topLeft` 固定。

## editor側の現状

`decocom_editor/src/pixel9a/transform.ts` の主な型:

```ts
export type Pixel9aEditorImageTransform = {
  centerX: number
  centerY: number
  imageWidth: number
  imageHeight: number
  scale: number
  rotationRad: number
}

export type Pixel9aDesignItemPayload = {
  id: string
  type: 'image'
  source_image_url: string
  top_left_pos_dx: number
  top_left_pos_dy: number
  size_width: number
  size_height: number
  scale: number
  angle: number
  scale_alignment: 'topLeft'
}

export type Pixel9aRenderPayload = {
  device: 'pixel-9a'
  source_image_url: string
  design_area: { width: number; height: number }
  items: Pixel9aDesignItemPayload[]
}
```

editor 内部は中心座標 `centerX/centerY` で操作し、render payload へ変換するときに Flutter に近い `top_left_pos_dx/dy`, `size_width/height`, `scale`, `angle` へ落としている。

## 比較表

| 項目 | Flutter | editor | 共通化判定 |
|---|---|---|---|
| 保存トップレベル | `{ state: DesignItem[] }` | render payload は `{ device, source_image_url, design_area, items }` | 別物 |
| 機種ID | 保存JSON内にはない。保存レコード側 `itemId` は Alicia `ItemV2.id` | `device: "pixel-9a"` | 変換要 |
| 商品/機種 alias | ルートや取得は `itemByAliasV2(alias)`、保存は数値 `itemId` | `pixel-9a` 固定 | 変換要 |
| 元画像 | `image_local_path` | `source_image_url` | 変換要 |
| 位置 | 左上原点の論理px | 内部 transform は中心。render item は左上論理px | 変換要 |
| 正規化座標 | 使わない | 初期案では 0〜1。現行 transform.ts は px | 変換要 |
| 拡縮 | `scale` 倍率 | `scale` 倍率 | 同じ |
| 回転 | `angle` ラジアン | `rotationRad` / `angle` ラジアン | 同じ |
| サイズ | `size_width/height` | `imageWidth/imageHeight` から生成 | 近い |
| 複数素材 | `state[]` | `items[]` はあるが現状 image のみ | 部分対応 |
| z-order | 配列順。後ろほど前面 | `items[]` 配列順で表現可能 | 変換可能 |
| 画像 | `image` | `image` | 部分対応 |
| テキスト | 旧フィールド + `text_item` | なし | 別物 |
| スタンプ | `stamp`, `myStamp`, `svg`, `paid_item`, pattern等 | なし | 別物 |
| フォトフレーム | `design_frame.frame_clippers[]` | なし | 別物 |
| canvasサイズ | itemごとの `design_size_width/height` | payload の `design_area` | 変換要 |
| 保存先 | Drift/SQLite + Alicia GraphQL `serializedItems` | commerce/Supabase 想定 | 別物 |

## 結論

**パターンC: 根本から違う → 共通スキーマ新設 or 変換層必須。**

理由:

- Flutter の保存JSONはエディタ全状態の永続化形式。
- editor の現在の payload は Pixel 9a の単一画像レンダリング用途が中心。
- Flutter は複数レイヤー、テキスト、SVGスタンプ、有料素材、背景、フォトフレーム、旧データ互換を持つ。
- 機種識別も Flutter は Alicia `ItemV2.id`、editor は `pixel-9a` 形式で異なる。

一方で、Pixel 9a の単一画像だけなら、editor の `Pixel9aDesignItemPayload` は Flutter の `DesignItem.toMap()` に近いため、軽い変換で render できる。

## 変換層の実装方針

### 推奨: 中間形式を新設

Flutter 形式に editor を寄せ切ると、React 側が Alicia/Flutter の歴史的互換を背負う。editor 形式に Flutter を寄せ切ると、既存保存データやテキスト/スタンプが落ちる。

そのため、commerce/editor 側には中間形式を置くのがよい。

```ts
type CommonDesign = {
  schema_version: 1
  device: string
  variant?: string
  alicia_item_id?: number // Flutter/Alicia 旧保存データ互換用。新規連携キーには使わない
  design_area: {
    width: number
    height: number
  }
  layers: CommonLayer[]
}

type CommonImageLayer = {
  id: string
  type: 'image'
  source_image_url: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  rotation_rad: number
  z_index: number
}

type CommonTextLayer = {
  id: string
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  scale: number
  rotation_rad: number
  text: string
  font_family: string
  font_size: number
  color: string
  align: 'left' | 'center' | 'right' | 'justify'
  vertical: boolean
  wrap: boolean
  z_index: number
}

type CommonLayer = CommonImageLayer | CommonTextLayer
```

### Flutter旧形式 → 中間形式

```ts
function flutterToCommon(
  saved: {
    itemId: number
    data: { state: FlutterDesignItem[] }
  },
  itemIdToDevice: (itemId: number) => string,
): CommonDesign {
  return {
    schema_version: 1,
    device: itemIdToDevice(saved.itemId),
    variant: undefined,
    alicia_item_id: saved.itemId,
    design_area: firstDesignArea(saved.data.state),
    layers: saved.data.state.map((item, index) => {
      if (item.type === 'text') {
        const textItem = item.text_item
        return {
          id: item.id,
          type: 'text',
          x: item.top_left_pos_dx,
          y: item.top_left_pos_dy,
          width: item.size_width,
          height: item.size_height,
          scale: item.scale,
          rotation_rad: item.angle ?? 0,
          text: textItem?.text ?? item.text ?? '',
          font_family: textItem?.font_family ?? item.font_family ?? 'NotoSansJP',
          font_size: textItem?.font_size ?? item.size_height,
          color: textItem?.font_color ?? item.text_color ?? '#ff000000',
          align: textItem?.text_align ?? 'center',
          vertical: textItem?.is_vertical_writing ?? item.is_vertical_writing ?? false,
          wrap: textItem?.is_wrap ?? true,
          z_index: index,
        }
      }

      return {
        id: item.id,
        type: 'image',
        source_image_url: item.image_local_path ?? item.svg_url,
        x: item.top_left_pos_dx,
        y: item.top_left_pos_dy,
        width: item.size_width,
        height: item.size_height,
        scale: item.scale,
        rotation_rad: item.angle ?? 0,
        z_index: index,
      }
    }),
  }
}
```

### 中間形式 → Flutter互換 item

```ts
function commonImageLayerToFlutterItem(
  layer: CommonImageLayer,
  designArea: { width: number; height: number },
): FlutterDesignItem {
  return {
    id: layer.id,
    sync_id: null,
    type: 'image',
    top_left_pos_dx: layer.x,
    top_left_pos_dy: layer.y,
    angle: layer.rotation_rad,
    scale: layer.scale,
    size_width: layer.width,
    size_height: layer.height,
    text: '',
    font_family: 'NotoSansJP',
    text_color: '#ff000000',
    is_editable_text: false,
    is_vertical_writing: false,
    image_local_path: layer.source_image_url,
    is_lock: false,
    stamp_color: null,
    svg_url: null,
    flip_x: false,
    flip_y: false,
    design_size_width: designArea.width,
    design_size_height: designArea.height,
    preset_color_filter_name: null,
    design_frame: null,
    paid_item: null,
    is_pattern: false,
    pattern_gap: null,
    pattern_source_size: null,
    stamp_aspect_ratio: null,
    text_item: null,
    scale_alignment: 'topLeft',
    restrictions: [],
  }
}
```

### editor transform → Flutter互換 item

editor 内部の中心座標から Flutter 互換の左上座標へ変換する。

```ts
function editorImageToFlutterItem(item: Pixel9aEditorImageItem): FlutterDesignItem {
  const scaledWidth = item.transform.imageWidth * item.transform.scale
  const scaledHeight = item.transform.imageHeight * item.transform.scale

  return {
    id: item.id,
    type: 'image',
    image_local_path: item.sourceImageUrl,
    top_left_pos_dx: item.transform.centerX - scaledWidth / 2,
    top_left_pos_dy: item.transform.centerY - scaledHeight / 2,
    size_width: item.transform.imageWidth,
    size_height: item.transform.imageHeight,
    scale: item.transform.scale,
    angle: item.transform.rotationRad,
    scale_alignment: 'topLeft',
    // 残りの Flutter 互換フィールドは default/null で埋める
  }
}
```

## 既存データ移行

過去注文の全量移行は不要。

理由:

- 過去注文は Alicia 側の物理/取引履歴として扱う。
- 再編集対象は savedDesign/templateDesign に限定できる。
- Flutter 旧形式は読み込み時にオンデマンド変換できる。

推奨:

1. 新規保存は `schema_version` 付きの中間形式で保存する。
2. 既存の Flutter `{"state":[...]}` は読み込み時に検出して中間形式へ変換する。
3. Alicia 連携や Flutter 再編集が必要な場合だけ、中間形式から Flutter互換 item へ変換する。
4. Pixel 9a 単一画像 render は、中間形式の image layer から `Pixel9aRenderPayload` を生成する。

## 2026-04-30 運用メモ

`decocom_commerce` を Railway production にデプロイした際、今回の Pixel 9a / Skia / Shopify webhook 周辺で以下の追加対応を行った。

### Railway Skia runtime

`skia-python` import 時に Railway runtime で `libEGL.so.1` が見つからず、Uvicorn 起動が失敗した。

```text
ImportError: libEGL.so.1: cannot open shared object file: No such file or directory
```

Railway は現在 Railpack でビルドしているため、`decocom_commerce/railpack.json` に runtime apt packages を追加した。

```json
{
  "$schema": "https://schema.railpack.com",
  "deploy": {
    "aptPackages": [
      "libegl1",
      "libgl1",
      "libglib2.0-0",
      "libx11-6",
      "libfontconfig1",
      "libfreetype6"
    ]
  }
}
```

あわせて `decocom_commerce/.gitignore` は `*.json` を無視していたため、`!railpack.json` を追加した。

反映コミット:

- `91e33c7 fix: install skia runtime libraries on Railway`

確認ログ:

```text
Starting Container
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

### Shopify webhook image URL

Shopify webhook 処理で line item property の画像URLが `http://` / `https://` なしの値になるケースがあり、`httpx.UnsupportedProtocol` で background job が unexpected failure になった。

```text
httpx.UnsupportedProtocol: Request URL is missing an 'http://' or 'https://' protocol.
```

対応:

- `app/services/image_fetch.py`
  - `fetch_png()` の先頭で絶対HTTP URLか検証。
  - `httpx.HTTPError` を `ImageFetchError` に包む。
- `app/webhooks/shopify.py`
  - `print_image_url` は絶対HTTP URL必須として検証。
  - `thumbnail_image_url` が不正な場合は落とさず `print_image` を thumbnail として使う。

反映コミット:

- `94832e4 fix: handle invalid Shopify image URLs`

確認ログ:

```text
INFO:httpx:HTTP Request: POST .../webhook_logs "HTTP/1.1 201 Created"
INFO:     ... "POST /webhook/shopify/decocom HTTP/1.1" 200 OK
INFO:httpx:HTTP Request: POST .../shopify_order_links "HTTP/1.1 201 Created"
INFO:httpx:HTTP Request: GET https://designcase.s3.isk01.sakurastorage.jp/...png "HTTP/1.1 200 OK"
INFO:httpx:HTTP Request: POST https://admin-dev.designcase.jp/alicia/api/v1/order "HTTP/1.1 200 OK"
INFO:httpx:HTTP Request: PATCH .../shopify_order_links?... "HTTP/1.1 204 No Content"
INFO:httpx:HTTP Request: PATCH .../webhook_logs?... "HTTP/1.1 204 No Content"
```

このログにより、Shopify webhook から Alicia 注文作成、Supabase の `shopify_order_links` / `webhook_logs` 更新まで通ったことを確認した。
