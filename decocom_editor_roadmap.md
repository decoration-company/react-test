# decocom_editor 進め方仕様書

作成日: 2026-04-29
対象: decocom_editor（Vite + React + TypeScript）
目的: Shopifyで使えるレベルのMVPまでの設計と段取りを定義する

---

## 1. 全体方針

### 1.1 設計思想
- **Flutter版（decocom_flutter）のロジックを軸にする**
- **重い処理（画像合成・印刷用高解像度生成）はサーバー側（decocom_commerce）に集約**
- **クライアント（Flutter / React）は軽量に保つ**
- Flutter版とReact版は同じサーバーAPIを叩く前提で設計し、コードの二重実装を避ける
- **Pixel 9a専用実装から、SVG path maskを扱える共通基盤へ寄せる**
- `aseClipSvgPathData`（既存命名では `caseClipSvgPathData` / `frameClipSvgPathData` 系のクリップSVG path）を端末固有定数として閉じ込めず、Reactプレビュー・サーバー合成・Flutter互換で同じ path data と fill rule を扱えるようにする

### 1.2 リポジトリ構成
| リポジトリ | 役割 | 言語/FW |
|----------|------|--------|
| decocom_editor | 共通カスタマイズUI（iframe埋め込み用） | Vite + React + TS |
| decocom_flutter | アプリ版エディタ（既存） | Flutter |
| decocom_commerce | 包括バックエンド + 画像生成API | FastAPI / Railway |
| アリシア | 注文・顧客・デザインデータの正本 | Laravel / MySQL |

### 1.3 MVPのスコープ（Shopifyで使えるレベル）
| 項目 | 状態 |
|------|------|
| Pixel 9a SVGマスク表示 | ✅ 完了 |
| マスク内に画像表示 | ✅ 完了 |
| SVG path parser拡張（`aseClipSvgPathData` 対応） | ⬜ 今回 |
| 画像の拡大縮小・回転・移動 | ⬜ 今回 |
| デザイン保存 → decocom_commerce へ送信 | ⬜ 今回 |
| 印刷用高解像度画像の生成（サーバー側） | ⬜ サーバー側担当 |
| Shopify Theme App Extensionでiframe埋め込み | ⬜ 後続 |
| 認証 | ⬜ 後続（要検討） |

### 1.4 スコープ外（今回はやらない）
- 複数デバイスUIの本格展開
- スタンプ・テキスト追加
- レイヤー管理・Undo/Redo
- ゲスト購入フロー
- カート連携・購入完了

**方針変更メモ**:
「Pixel 9aのみの個別対応」ではなく、まず `aseClipSvgPathData` を含むSVG pathを正しく読める共通パーサ/マスク解決層を作る。Pixel 9aはその最初の利用例として残すが、実装の主語は `pixel9a` ではなく `svg_path mask` にする。

---

## 2. アーキテクチャ

### 2.1 処理の振り分け方針

| 処理 | クライアント | サーバー |
|------|------------|---------|
| SVGマスク描画 | ✅ | ー |
| SVG path dataの検証・正規化 | 軽量検証のみ | ✅（正本） |
| 画像のドラッグ・拡大縮小・回転（プレビュー） | ✅ | ー |
| プレビュー画像生成（Canvas API） | ✅ | ー |
| 印刷用高解像度画像生成 | ー | ✅ |
| デザインパラメータの保存 | ー | ✅（decocom_commerce。必要に応じてアリシア既存連携） |

### 2.1.1 `aseClipSvgPathData` 対応を入れる場所

`aseClipSvgPathData` 対応は、Pixel 9a画面コンポーネントではなく **共通SVG path mask層** に入れる。

| 層 | 入れる場所 | 役割 |
|----|----------|------|
| decocom_editor | `src/svg-path/` または `src/masks/` を新設 | Reactプレビュー用に path data / viewBox / bounds / fill rule を扱う。DOM SVGの `<path d>` へ渡せる形にする |
| decocom_editor | `src/pixel9a/` | Pixel 9a固有のUI・初期値・デバッグ表示だけを持つ。path parser本体は置かない |
| decocom_commerce | `app/rendering/skia_python.py` の `_svg_path_to_skia_path` 周辺 | 印刷用合成の正本。Skia pathへ変換し、`M/L/H/V/C/Z` 以外のSVG path commandも必要に応じて拡張する |
| decocom_commerce | `app/api/skia.py` の `RenderMask` | `mask: { type: "svg_path", path_data, fill_type }` をAPI契約として維持し、path長・fill rule・将来のviewBox指定を検証する |
| decocom_flutter | `path_drawing.parseSvgPathData` 利用箇所 | 既存Flutter表示との互換確認用。Flutterに独自parserを足すのではなく、React/commerceの結果をFlutterの見た目と比較する |

**理由**:
- `aseClipSvgPathData` はデバイス名ではなく「SVG pathで表現されたクリップ形状」なので、Pixel 9aディレクトリに閉じ込めると次の機種・手帳型・フレーム型で再利用できない
- サーバー合成が製造用の正本になるため、最終的に対応すべきparserは decocom_commerce 側
- React側はブラウザSVGに描画させられるため、parserは最小限でよい。ただし bounds算出、viewBox原点化、fill ruleの扱いは共通化しておく

### 2.1.2 SVG path parser拡張の対象

まず既存の commerce parser が対応済みの `M/m`, `L/l`, `H/h`, `V/v`, `C/c`, `Z/z` を維持する。そのうえで `aseClipSvgPathData` に含まれる可能性がある command を優先して追加する。

優先順:
1. `S/s`: smooth cubic bezier
2. `Q/q`: quadratic bezier
3. `T/t`: smooth quadratic bezier
4. `A/a`: elliptical arc
5. 複数subpath、連続座標、省略command、指数表記、カンマ/空白混在の厳密化

`A/a` は実装ミスの影響が大きいため、まず対象pathに含まれるか確認する。含まれる場合は自前近似より、信頼できるSVG path parserライブラリの導入、または十分なテスト付きのarc to cubic変換を検討する。

### 2.2 データフロー

```
[ユーザー] 
   ↓ 画像アップロード・操作
[decocom_editor (React)]
   ↓ デザインパラメータ + 元画像
[decocom_commerce /api/skia/render]
   ↓ 印刷用高解像度画像生成（Skia / canvaskit-wasm）
   ↓ Supabase Storage（または S3）に保存
   ↓ 画像URL + パラメータ
[アリシア]
   ↓ 注文データに紐付け
[製造工程]
```

### 2.3 保存データ設計（決め事・要すり合わせ）

**方針**: パラメータ + 元画像URL + 合成済み高解像度画像URL の3点セットで保存する。

**理由**:
- パラメータだけだと、後から合成ロジックが変わったときに過去の注文を再現できなくなる
- 合成画像だけだと、再編集ができない
- 両方持っておけば、再編集も製造もできる

**Flutter版確認後の決定**:
- Flutter版の `DesignItem` は `topLeftPos` / `size` / `scale` / `angle` を正本にしている
- `angle` は degree ではなく radian
- `scale` は画像自然サイズに対する倍率で、初期coverを `1.0` とするモデルではない
- `scale_alignment` は新規保存では `topLeft` 固定
- React版MVPも、内部状態と保存payloadは Flutter の `DesignItem` 語彙に寄せる

**保存payload案**（decocom_commerce 側）:
```json
{
  "design_id": "uuid",
  "device": "pixel-9a",
  "mask": {
    "type": "svg_path",
    "path_data": "M172.22,441.43H35.65...",
    "fill_type": "even_odd",
    "view_box": {
      "width": 207.87,
      "height": 441.93
    }
  },
  "source_image_url": "https://storage.../uploads/xxx.jpg",
  "composed_image_url": "https://storage.../composed/xxx.png",
  "preview_image_url": "https://storage.../preview/xxx.jpg",
  "design_area": {
    "width": 207.87,
    "height": 441.93
  },
  "items": [
    {
      "id": "uuid",
      "type": "image",
      "source_image_url": "https://storage.../uploads/xxx.jpg",
      "top_left_pos_dx": -20.0,
      "top_left_pos_dy": 0.0,
      "size_width": 247.87,
      "size_height": 441.93,
      "scale": 1.0,
      "angle": 0.0,
      "scale_alignment": "topLeft"
    }
  ],
  "created_at": "2026-04-29T..."
}
```

**MVP中のReact内部transform**:
単画像編集では中心座標のほうがUI実装しやすいため、React内部では `centerX` / `centerY` / `scale` / `rotationRad` を持ってよい。ただし保存・サーバー送信直前に上記の `DesignItem` 形式へ変換する。

```json
{
  "center_x": 103.935,
  "center_y": 220.965,
  "image_width": 247.87,
  "image_height": 441.93,
  "scale": 1.0,
  "rotation_rad": 0.0
}
```

`top_left_pos_dx = center_x - image_width * scale / 2`、`top_left_pos_dy = center_y - image_height * scale / 2` を基本変換にする。回転中心は Flutter版と同じくアイテム中心。

**参考: 当初案（採用しない）**:
```json
{
  "design_id": "uuid",
  "device": "pixel-9a",
  "source_image_url": "https://storage.../uploads/xxx.jpg",
  "composed_image_url": "https://storage.../composed/xxx.png",
  "transform": {
    "center_x": 0.5,
    "center_y": 0.5,
    "scale": 1.2,
    "rotation_deg": 0
  },
  "viewport": {
    "width": 574.08,
    "height": 840.97
  },
  "created_at": "2026-04-29T..."
}
```

`center_x` / `center_y` 正規化座標だけを正本にすると Flutter版の既存保存モデルとズレるため、正本にはしない。再編集UI用の派生値として扱う。

**transform定義で決めること**:
- `top_left_pos_dx` / `top_left_pos_dy`: マスク論理座標内における画像左上座標
- `scale`: Flutter版に合わせ、画像自然サイズに対する倍率
- `angle`: Flutter版に合わせ、radianで保存
- `design_area`: React表示サイズではなく、Pixel 9a SVG viewBoxの論理サイズを保存する
- `mask.path_data`: `aseClipSvgPathData` 相当のSVG path文字列。device固有定数から参照してよいが、保存・render APIでは `mask` として明示する
- `mask.fill_type`: 穴抜きがあるケースは `even_odd` を使う。Flutter/React/Skiaで同じ穴抜き結果になることを確認する
- サーバー合成時はこのtransformを唯一の正本として、React / Flutter / Skiaで同じ見た目になることを目標にする

---

## 3. サーバーAPI設計（要すり合わせ）

### 3.1 `/api/skia/render` リクエスト形式案

```http
POST /api/skia/render
Content-Type: application/json

{
  "device": "pixel-9a",
  "mask": {
    "type": "svg_path",
    "path_data": "M172.22,441.43H35.65...",
    "fill_type": "even_odd"
  },
  "source_image_url": "https://storage.../uploads/xxx.jpg",
  "design_area": {
    "width": 207.87,
    "height": 441.93
  },
  "items": [
    {
      "id": "uuid",
      "type": "image",
      "source_image_url": "https://storage.../uploads/xxx.jpg",
      "top_left_pos_dx": -20.0,
      "top_left_pos_dy": 0.0,
      "size_width": 247.87,
      "size_height": 441.93,
      "scale": 1.0,
      "angle": 0.0,
      "scale_alignment": "topLeft"
    }
  ]
}
```

**レスポンス**:
```json
{
  "design_id": "uuid",
  "composed_image_url": "https://storage.../composed/xxx.png",
  "preview_image_url": "https://storage.../preview/xxx.jpg"
}
```

### 3.2 画像アップロードAPI（別エンドポイント案）

```http
POST /api/upload
Content-Type: multipart/form-data

file: <binary>
```

**レスポンス**:
```json
{
  "source_image_url": "https://storage.../uploads/xxx.jpg"
}
```

### 3.3 Flutter版との共通化
- Flutter版も将来的に同じエンドポイントを叩く前提で設計
- リクエスト/レスポンス形式は Flutter の `DesignItem.toMap()` に寄せる
- `device` は今後の拡張に備えて文字列ID
- `mask` は `device` からサーバー側で解決してもよいが、MVPではデバッグしやすいように `path_data` を明示送信できる形を残す
- 将来的には `device` + `case_type` から commerce が `mask_id` / `path_data` / `fill_type` / `viewBox` を解決し、クライアント送信のpathを信用しない構成に寄せる
- Flutter版の既存アップロードキーは歴史的に `image_local_path` だが、React/commerce APIでは `source_image_url` として扱い、必要ならサーバー側で変換する

### 3.4 Shopify連携時に返す値（先に意識する）
Theme App Extension対応は後続だが、保存完了後に親ページへ返す最低限の値は先に決めておく。

```ts
window.parent.postMessage({
  type: 'decocom:designSaved',
  design_id: 'uuid',
  preview_image_url: 'https://storage.../preview/xxx.jpg',
}, '*')
```

**要確認**:
- `line item properties` に入れる値は `design_id` のみにするか、確認用URLも入れるか
- iframe側で保存完了までカート追加を止めるか、親側で制御するか
- postMessageのorigin制限を本番ドメインに合わせて設定する

---

## 4. 実装フェーズ（decocom_editor側）

### Phase A0: SVG path parser / mask基盤（今回追加）
**目的**: `aseClipSvgPathData` をPixel 9a専用ではなく、共通maskとして扱えるようにする

- [ ] 対象の `aseClipSvgPathData` に含まれるSVG path commandを棚卸しする
- [ ] decocom_commerce の `_svg_path_to_skia_path` を必要command分だけ拡張する
- [ ] `fill_type: even_odd` の穴抜き結果をテストする
- [ ] path bounds / viewBox / 原点化の扱いを固定する
- [ ] React側に `src/masks` または `src/svg-path` を新設し、Pixel 9a固有定数から切り離す
- [ ] Pixel 9aの既存表示が新しい共通mask定義で変わらないことを確認する

**受け入れ条件**:
- `aseClipSvgPathData` を render API の `mask.path_data` として渡してもサーバー合成が成功する
- Reactプレビューとサーバー合成で、外周と穴抜きが同じ向き・同じ位置になる
- parser未対応commandが来た場合、サーバーは成功扱いにせず、どのcommandが未対応か分かるエラーを返す

### Phase A: 画像操作機能（1〜2週間）
**目的**: マスク内で画像を自由に動かせるようにする

- [x] Flutter版のtransform定義を確認
- [x] React版の保存用transform型を決定
- [ ] ピンチズーム / マウスホイールで拡大縮小
- [ ] ドラッグで移動
- [ ] 2本指 / ボタンで回転
- [ ] タッチ・マウス両対応
- [ ] マスク範囲外はクリッピング維持
- [ ] 現在のtransformをJSONで確認できるデバッグ表示を用意

**技術選定の判断ポイント**:
- まずは素のSVG + React stateで進める
- 画像1枚の `transform` だけなら react-konva はまだ不要
- 複数レイヤー、テキスト、Undo/Redoまで広げる段階で canvas / konva 導入を再判断する

### Phase B: 保存とサーバー連携（並行）
**目的**: 操作したデザインをサーバーに送って保存

- [ ] 「保存」ボタンでデザインパラメータ収集
- [ ] 元画像を `/api/upload` に送信 → URL取得
- [ ] パラメータ + 画像URLを `/api/skia/render` に送信
- [ ] レスポンスの `composed_image_url` を表示（確認用）
- [ ] エラーハンドリング

**サーバー側との連携**:
- API仕様（3.1, 3.2）の合意
- サーバー側の実装完了タイミングを確認
- 完了前はモックAPIで進められるようにしておく

### Phase C: Shopify組み込み（後続）
- Theme App Extensionで iframe 埋め込み
- postMessage で親ページとの通信
- line item properties に `design_id` を注入
- カート追加フロー

### Phase D: 認証（後続）
- 設計次第。ゲスト購入を許すなら一時トークンでもOK
- Shopify顧客と紐付けるなら customer access token

---

## 5. 未決事項（次に詰めるべきこと）

| 項目 | 対応 |
|------|----------|
| transformの基準（中心座標/左上座標、scale基準、rotation方向） | **決定**: 保存正本は Flutter `DesignItem` 互換の左上座標 + 自然サイズscale + radian。React内部だけ中心座標可 |
| サーバーAPIのリクエスト/レスポンス形式 | **一次決定**: `design_area` + `items[]` を送る。エンドポイント名と保存先はサーバー側で確定 |
| SVG path parserの対応範囲 | **今回追加**: `aseClipSvgPathData` に含まれるcommandを最優先。commerce側を正本parserにし、React側は表示・軽量検証に留める |
| maskの正本 | **今回追加**: MVPは `mask.path_data` 明示送信可。将来は `device` / `case_type` / `mask_id` からcommerce側で解決 |
| 画像ストレージの場所（Supabase / S3 / アリシア直） | **未決**: commerce側で決める。アリシア直保存は避け、URL/ID連携に留める方針 |
| アリシア側の保存スキーマ | **保留**: Aliciaは読み取り中心。新規スキーマ変更を前提にせず、commerce側の `design_id` を正本にする |
| 印刷用画像の解像度・形式（最終px、300dpi、塗り足し、透明背景、カラープロファイル） | サーバー側 + 製造現場とすり合わせ |
| 認証方式 | Shopify組み込み時 |
| iframe埋め込み時のpostMessage仕様 | Shopify組み込み時 |

---

## 6. Flutter版と見比べて埋める確認事項

decocom_all内のFlutter版を確認して、React版・サーバー版と合わせるべき項目を埋める。

| 確認項目 | Flutterで見た場所/観点 | 決定・方針 |
|----------|--------------|------------|
| デバイスID | `pixel_9a_hard_white_inline_frame_clip.dart` の `isPixel9aModelForDesignCaseMask` は model名/alias の `pixel9a` 判定 | React/commerceの外部IDは `pixel-9a` に統一。Flutter接続時は model/alias 判定から `pixel-9a` に正規化 |
| マスク座標系 | Flutter fallback path は `M367.68...` 系で、React SVGは `Google-Pixel9a.svg` の viewBox `207.87 x 441.93` | React MVPは現行SVG viewBox `207.87 x 441.93` を論理座標にする。サーバーは path bounds を原点化して同じ座標で描く |
| SVG path parser | Flutterは `path_drawing.parseSvgPathData`、commerceは `_svg_path_to_skia_path`、ReactはブラウザSVG描画 | parser拡張はcommerce側を主対象にする。Reactは共通mask定義へ移し、表示差分の検出に使う |
| 初期画像配置 | Flutter背景は `ImageItemWidget` 側の `BoxFit.cover` 相当。Pixel9a previewは `DesignItemLayer` を積むだけ | Reactは選択画像をマスク外接矩形へ cover 初期配置。保存時は cover済みの `size_width/height` と `top_left_pos` に展開し、`scale=1.0` から始める |
| 移動量 | `DesignItemMoveHandler`: 画面px差分を `designRatio` で割って `topLeftPos` を更新 | ReactもDOM上の表示倍率を逆算して、画面px差分をSVG viewBox座標へ変換する。保存は正規化座標ではなく論理px |
| ズーム | `DesignItemScaleHandler`: 画像/スタンプは `scale` 更新。下限 `kDesignItemMiniScale`、上限 `kDesignItemMaxScale` | React MVPは `scale` を画像自然サイズ/初期coverサイズへの倍率として保持。min/maxはUIで仮設定し、Flutter定数と体感を合わせる |
| 回転 | `DesignItemRotateHandler`: `atan2(cross, dot)` の radian を `angle` に保存。回転中心はアイテム中心 | React/commerceも `angle` は radian。画面上で時計回りが正方向に見えるSVG座標系のまま保存し、サーバーで同じ行列順にする |
| 保存データ | `DesignItem.toMap()`: `top_left_pos_dx/dy`, `angle`, `scale`, `size_width/height`, `design_size_width/height`, `scale_alignment: topLeft` | React APIはこのキー名へ寄せる。単画像MVPでも `items[]` にして後からスタンプ/テキストを足せる形にする |
| プレビュー生成 | `Pixel9aDesignView` + `PrintImageService.export`。現在はFlutter上のRepaintBoundary書き出し | Reactの画面プレビューはSVGで十分。正本の印刷画像はサーバー合成結果を使い、Flutter書き出しとの差分は目視比較で詰める |
| 画像アップロード | `DesignItem.toMap()` 内で `designImageUploaderProvider` を使い、保存キーは `image_local_path` | Reactは `/api/upload` で `source_image_url` を受け取る。Flutter互換保存へ入れる場合のみ `image_local_path` へ変換 |
| エラー処理 | `validateImageFile`: 10MB超過、PNG/JPEG/JPG以外を拒否。失敗時はダイアログ/スナックバー | ReactもMVPで10MB上限、PNG/JPEG/JPGのみ。保存失敗・生成失敗はボタン復帰 + メッセージ表示 |
| 注文連携 | Pixel9a previewは印刷PNG/サムネイル保存まで。注文連携の正本IDは未確定 | Shopify MVPでは `design_id` を commerce 側で発行し、line item properties にはまず `design_id` のみ入れる。確認用URLは管理/デバッグ用 |

---

## 7. 直近の進め方

### 7.1 editor側で先に作るもの
- `src/masks` または `src/svg-path` にSVG path mask定義・bounds・fill ruleを扱う共通層を追加する
- `src/pixel9a` はPixel 9a固有UIだけに寄せ、clip path定数を共通mask層から参照する
- transform 型と座標変換関数を追加する
- `Pixel9aCaseMaskPreview` をドラッグ/ホイール/回転ボタン対応にする
- デバッグ用に現在の `items[]` payload を表示する
- 画像選択時に自然サイズを読み、マスク外接矩形にcover初期配置する
- 保存ボタンはモックAPIから始め、payloadの形を先に固定する

### 7.2 commerce側に渡す確認
- `aseClipSvgPathData` に含まれるSVG path command一覧
- `_svg_path_to_skia_path` で追加すべきcommandと、ライブラリ導入可否
- `mask.path_data` をMVPでクライアントから送るか、commerce側の `mask_id` 解決に先に寄せるか
- `/api/upload` と `/api/skia/render` を分けるか、renderでmultipartも受けるか
- `design_area` と `items[]` のpayloadをそのまま保存するか、commerce内の別スキーマに変換するか
- 生成画像の保存先を Supabase Storage / R2 / S3 のどれにするか
- Pixel 9aの最終印刷サイズを `item.frameImageWidth` / `item.frameImageHeight` 相当にどう持つか

### 7.3 後回しにするもの
- Aliciaのスキーマ変更を前提にした実装
- 複数機種対応
- スタンプ、テキスト、レイヤー管理
- Undo/Redo
- Shopify認証の本設計

## 8. 直近のアクション

1. `aseClipSvgPathData` の実pathを確認し、必要なSVG commandを洗い出す
2. decocom_commerce のSVG path parser拡張方針を決める
3. decocom_editorに共通mask層を追加し、Pixel 9a表示をそこへ接続する
4. decocom_editorでPhase A（画像操作）を継続
5. `items[]` + `mask` payloadをデバッグ表示しながら、Flutter互換の座標変換を確認
6. Phase Aと並行して、モックAPIでPhase Bを試作
7. commerce側API仕様を確定
8. サーバーAPI実装完了後に本接続へ切り替え
9. Shopify iframe組み込みへ進む
