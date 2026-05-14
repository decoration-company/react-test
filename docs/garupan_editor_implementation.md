# Garupan editor implementation

作成日: 2026-05-10
対象: `decocom_editor` の `/garupan?variant=...` ルート追加。

## 実装方針

- URL設計は `/tigers` と同じく `/garupan?variant=xxx`。
- UIは `decocom_flutter` のガルパン実装に合わせ、既存の自由配置デザイン画面へガルパン専用ボトムメニューを出す構造に寄せた。
- ただし現時点では Alicia / GraphQL / 実素材連携はせず、Pixel 9a のケースマスクと絵文字ダミースタンプで仮実装。
- `/tigers` は3ステップ固定レイアウト、`/garupan` は自由配置のため、初回は無理に共通化しない。共通化は `pixel9a/constants` のマスク定数共有に留めた。

## Flutter実装との対応表

| Flutter | React実装 | 備考 |
|---|---|---|
| `/collaboration/gup-mottolovelove` | `/garupan?variant=...` | Shopify配布軸用に単体エディタとして追加 |
| `context.go('/design/:alias?collaboration=gup-mottolovelove')` | `variant` クエリから mock item を作成 | 商品/spec取得APIは未接続 |
| `DesignStageView` | `GarupanEditor` | 上部バー、キャンバス、下部メニュー構造 |
| `DesignPageView` | `GarupanCanvas` | Pixel 9a のSVGクリップ内に背景・スタンプを描画 |
| `GupMenu` | `BottomMenu` | `ギャラリー / 背景 / ガルパン / スタンプ` の4ボタン |
| `MenuSheetView` | `Sheet` | 下部シートとして仮実装 |
| `GupIllustGridView` | `garupanStampResources` + `garupan-stamp-grid` | 絵文字10個程度のダミー素材 |
| `GupBackgroundContentView` | 背景カラー選択 | GraphQL背景素材ではなくカラーのみ |
| `DesignItemsViewModel.addStampItem` | `GarupanPlacedStamp` state追加 | x/y/size/rotation を保持 |
| `StampEditMenu` | `ToolPanel` | サイズ、回転、複製、削除 |
| DB保存 / カート投入 | mock `postMessage` + console | `preview_url` / `print_image_url` は未生成 |

## /tigersとの差分

| 項目 | `/tigers` | `/garupan` |
|---|---|---|
| 画面設計 | 3ステップ選択式 | 自由配置エディタ |
| スタンプ数 | レイアウトごとに固定 | 任意数 |
| 配置 | `TigersLayout` 定義で固定 | ドラッグで移動 |
| サイズ・回転 | レイアウト定義で固定 | 選択中スタンプをスライダーで変更 |
| 背景 | Tigers専用画像 | 仮の背景カラー |
| プレビュー | STEP完了後の確認画面 | 常時編集キャンバス + プレビュー画面 |
| 保存形式 | Flutter互換 `simpleDesign` | 仮の `freeDesign` |
| 共通化 | なし | Pixel 9a マスク定数のみ共有 |

## 今後の課題

1. 実素材連携
   - ガルパン paid resources / background resources を commerce BFF 経由で取得する。
   - IP素材は用途限定のため、静的public配下に置くかBFF署名URLにするか要決定。

2. 商品/spec連携
   - `/api/products/{variant}/print-spec` から実寸、マスク、商品情報を取得する。
   - Pixel 9a 固定の `PIXEL_9A_CASE_CLIP_PATH_D` 依存を外す。

3. 保存形式
   - Flutterの既存 `DesignItem` 保存形式へ寄せるか、Shopify配布軸用の軽量JSONにするかを決める。
   - `spec_id` / `design_id` を postMessage へ含める扱いを `/tigers` と合わせて整理する。

4. 操作性
   - タッチのピンチ拡大、回転ジェスチャ、レイヤー順変更、undo/redo を検討する。
   - 現状はドラッグ、サイズ、回転、複製、削除まで。

5. ギャラリー
   - Flutterの `CollaborationTemplateGridView` 相当はダミー。
   - 共有デザインの読み込み、テンプレ適用、初回自動オープン条件を移植する。

## Flutter版との挙動差分

| 項目 | Flutter版 | `/garupan` 現実装 |
|---|---|---|
| 選択枠 | `ThemeColor.selectedBorder` = `#12CDD7`、3px相当、アイテム外側に描画 | SVG内で `#12CDD7` / 3px。絵文字スタンプの正方形サイズに合わせて描画 |
| 削除ハンドル | 左上、白い32px円、黒いcloseアイコン、タップで削除 | 左上、白円、`×` 表示。pointer downで即削除 |
| 回転ハンドル | 右上、白い32px円、黒い回転アイコン、ドラッグで中心基準回転 | 右上、白円、`↻` 表示。SVG座標で中心基準回転 |
| 拡縮ハンドル | 右下、白い32px円、黒い拡縮アイコン、ドラッグで拡縮 | 右下、白円、`↘` 表示。回転済み左上からの距離で拡縮 |
| 移動 | 選択中アイテム全面をドラッグ | スタンプ本体をドラッグ |
| 選択解除 | デザイン領域外側タップで `unselectedDesignProvider` | SVGキャンバスの空き領域pointer downで解除 |
| ピンチ拡縮 | Flutter共通エディタ側のズーム/操作系に依存 | 未対応。Webではハンドルドラッグで拡縮 |
| Undo/Redo | `designDataServiceProvider.saveState()` と履歴更新 | 未対応 |

## 使用ライブラリ

- 追加ライブラリなし。
- React state と SVG Pointer Events のみで実装。
- Flutter版の `DesignItemMoveHandler` / `DesignItemRotateHandler` / `DesignItemScaleHandler` の考え方に合わせ、移動・回転・拡縮を別ジェスチャーとして扱う。

## 未対応項目

- 実画像/実SVG素材の自然サイズに応じた矩形選択枠。
- ハンドルアイコンのFlutter SVGアセット完全一致。
- ハンドルサイズを画面ズームに対して常に32px固定にする処理。
- ピンチ拡縮、二本指回転、undo/redo、レイヤー順変更。
- 見切れ・重なり・IP制約違反時の赤枠表示。
