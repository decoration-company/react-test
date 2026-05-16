# Tigers editor refactor plan

作成日: 2026-05-16
対象: `decocom_editor` の `/tigers` ルート（阪神タイガースコラボ専用エディタ）
目的: Shopify iframe 埋め込み前提でモバイル単一レイアウトに統一し、編集セレクト領域の操作性を改善する
ステータス: 調査メモ。コード変更は未着手。

---

## 1. 現状の構成

### 1.1 ファイル一覧

```text
decocom_editor/src/tigers/
  TigersEditor.tsx                 # 画面全体（3ステップ + プレビュー画面）
  TigersEditor.css                 # スタイル一式（モバイル中心、PC幅は flex row）
  TigersDesignPreview.tsx          # ケース合成 SVG（forwardRef）
  tigersTypes.ts                   # TigersStep / Stamp / Layout / Background / MockItem
  tigersData.ts                    # スタンプ・背景・レイアウト・モック商品の定義
  tigersDesignSerialization.ts     # Flutter互換 SimpleDesign JSON 生成

decocom_editor/public/assets/tigers/
  tigers-stamp/tigers-stamp-01..15.png
  tigers-back/tigers_back_case1..5.png, tigers_back_diary1..5.png
```

参照する横断ファイル:

| パス | 用途 |
|---|---|
| `src/pixel9a/constants.ts` の `PIXEL_9A_CASE_CLIP_PATH_D` / `PIXEL_9A_CASE_CLIP_SVG_VIEW_BOX` | Pixel 9a クリップ path。背景マスク・印刷サイズの源。 |
| `src/api/commerce.ts` の `uploadImage`, `saveDesign` | 画像アップロード→`/api/upload`、デザイン保存→`/api/designs`。 |
| `src/api/svgExport.ts` の `svgElementToPngFile` | SVG → PNG ファイル化（保存前に呼ぶ）。 |
| `src/App.tsx` | `path === '/tigers'` で `TigersEditor` に分岐。 |

### 1.2 コンポーネントツリー（実装）

```text
TigersEditor (variant)
├─ stamp/layout/background ステップ時
│   <section.tigers-editor [.is-step-stamp]>
│   ├─ <div.tigers-editor__left>
│   │   ├─ <header.tigers-editor__header>
│   │   │   ├─ TigersBackButton ‹
│   │   │   ├─ <h1>STEP n</h1>
│   │   │   └─ tigers-step-indicator (3 ドット)
│   │   └─ <div.tigers-preview-area>
│   │       ├─ SelectedCaseInfoRibbon (item)
│   │       └─ <div.tigers-preview-area__center>
│   │           ├─ stamp 時: StampPreviewFull (1枚)
│   │           └─ layout/background 時: TigersDesignPreview (SVG ケース合成)
│   └─ <div.tigers-editor__right>
│       ├─ <div.tigers-section-title> (h2 + p)
│       ├─ <div.tigers-selection-scroll>     ← overflow:auto の唯一の領域
│       │   ├─ stamp:       StampGrid
│       │   ├─ layout:      LayoutSelection
│       │   │               ├─ tigers-layout-options
│       │   │               └─ (double/pattern時) tigers-additional-stamps
│       │   │                   ├─ tigers-stamp-slots
│       │   │                   └─ tigers-stamp-grid (additional)
│       │   └─ background:  BackgroundSelection
│       └─ <footer.tigers-editor__footer> (TigersPrimaryButton)
│
└─ preview ステップ時
    <section.tigers-preview-page>
    ├─ <header.tigers-preview-page__appbar> ‹ プレビュー
    ├─ <div.tigers-preview-page__body>      ← overflow:auto
    │   ├─ <div.tigers-preview-page__mockup height:280px> TigersDesignPreview
    │   ├─ <div.tigers-preview-card> 商品情報
    │   └─ <div.tigers-preview-note>
    └─ <footer.tigers-preview-page__footer>
        ├─ tigers-gallery-check (postToGallery)
        └─ TigersPrimaryButton (save → postMessage)
```

### 1.3 レイアウト指定の要点（[TigersEditor.css](../src/tigers/TigersEditor.css)）

| セレクタ | 指定 | 意味 |
|---|---|---|
| `.tigers-editor` | `display:flex; min-height:100svh` | PCは横並び（**PCで崩れる原因**）。 |
| `.tigers-editor.is-step-stamp .__left/__right` | `flex: 3/5 1 0` | stamp ステップのみ右側を広く。 |
| `.tigers-preview-area` | `flex:1 1 auto; min-height:0` | PC では高さ可変。 |
| `.tigers-selection-scroll` | `flex:1 1 auto; min-height:0; overflow:auto` | 選択肢の縦スクロール領域。**ここが現在の課題**。 |
| `@media (max-width:767px) .tigers-preview-area` | `height:420px; flex:0 0 auto` | モバイルでは固定高。 |
| `@media (max-width:767px) .is-step-stamp .tigers-preview-area` | `height:280px` | stamp 時だけ短い。 |
| `.tigers-design-preview__pixel9a-svg` | `width: min(100%, 190px); aspect-ratio:207.87/441.93` | プレビュー SVG は最大幅 190px（モバイル時 180px）。 |

要するに「**プレビュー固定 420px**（stamp 時のみ 280px）」がモバイルレイアウトの実体で、残り高さに `tigers-selection-scroll` が縦スクロールで詰め込まれる構造。iPhone SE (667px) 想定だと `selection-scroll = 667 - 60(header) - ~80(footer) - 420 = ~107px` となり、グリッドが極めて窮屈になる。これが「編集セレクト部分の操作領域が狭い」の正体。

### 1.4 状態管理

```ts
useState<TigersStep>('stamp')               // currentStep
useState<TigersStamp[]>([])                 // selectedStamps (max 2)
useState<TigersLayout>(tigersLayouts[0])    // selectedLayout
useState<TigersBackground>(visibleTigersBackgrounds[0])  // selectedBackground
useState(0)                                 // LayoutSelection 内 activeSlot
// PreviewScreen 内
useState(true)                              // postToGallery
useState(false)                             // isSaving
useState<string|null>(null)                 // saveError
```

- Context や Zustand などのグローバル状態は無し。`TigersEditor` 親が全状態を握る単純構成。
- ステップ遷移は `jumpToStep` / `goBack` / `nextStep` の3関数で線形に `stamp → layout → background → preview`。後戻りは step indicator のドットクリックでも可能（`canJump` の前提条件付き）。

### 1.5 プレビュー反映の仕組み

- `TigersDesignPreview` は forwardRef された SVG コンポーネント。viewBox は `0 0 ${printWidth} ${printHeight}` （Pixel 9a の場合 `207.87 x 441.93`）。
- 状態が更新されるたびに親が新しい props を渡し、SVG は単純な再レンダリングで即時反映される（リアルタイム性は React の通常レンダリングサイクルそのまま、特別な同期処理は無い）。
- 印刷用 PNG は `svgElementToPngFile(svgRef.current, ...)` で SVG DOM をシリアライズ→Canvas→PNG 化。プレビューと印刷は同じ SVG ツリーを共有。

### 1.6 ガルパン（/garupan）との共通化状況

- **共通化されているのはインフラのみ**: `pixel9a/constants` のクリップ path、`api/commerce`、`api/svgExport`。
- **エディタ本体は完全に別実装**: ファイル構造（`tigers/` と `garupan/`）、CSS（`TigersEditor.css` と `GarupanEditor.css`）、型、データ、シリアライズはすべて独立。
- 両者ともに `embeddedParentOrigin()` / `isShopifyEmbed()` 関数を**それぞれ1:1で重複定義**している（リファクタ候補）。
- UX 設計思想は対照的:
  - **Tigers**: 3ステップ選択式（自由配置なし、レイアウト固定）。
  - **Garupan**: 自由配置式（pointer event でドラッグ・拡縮・回転、ボトムシート＋ボトムメニュー）。
- 共通化を進めるなら、まず `embeddedParentOrigin` / `isShopifyEmbed` / postMessage 送信処理を `src/embed/shopify.ts` 等に括り出すのが最小コストで効くポイント。

---

## 2. Shopify 埋め込みの現状仕様

### 2.1 iframe 受信側（Shopify テーマ）

[decocom_shopify_theme/sections/decocom-editor.liquid](../../decocom_shopify_theme/sections/decocom-editor.liquid):

- product メタフィールド `custom.decocom_editor_mode` (例: `tigers`) と `custom.decocom_variant` を元に iframe URL を組み立て。
- iframe URL: `https://decocomeditor.vercel.app/{editor_mode}?variant={variant}&embed=shopify&parent_origin={shop.url}`
- iframe スタイル: `width:100%; aspect-ratio:4/3; border:none;` — **横長 4:3 固定**。これがモバイルで縦長の編集 UI を圧迫している大きな要因。
- `message` イベントを受け、`data.type === 'decocom:design:ready'` ならカート追加（`/cart/add.js`）→ `/cart` 遷移。

### 2.2 iframe 送信側（TigersEditor）

[TigersEditor.tsx:300-344](../src/tigers/TigersEditor.tsx#L300-L344):

```ts
// クエリ
?variant=...
?embed=shopify | ?platform=shopify   // どちらかで埋め込み判定
?origin=... | ?parent_origin=...     // 親 origin、未指定なら "*"

// 保存フロー
uploadImage(file)
  → saveDesign({ variant, composed_image_url, design_data })
  → window.parent.postMessage({
       type: 'decocom:design:ready',
       variant,
       spec_id: result.design_id,   // ★ design_id を spec_id として再利用
       design_id: result.design_id,
       preview_url: result.preview_image_url,
       print_image_url: result.composed_image_url,
     }, parentOrigin)
```

- `spec_id` は **commerce 側 `saveDesign` の `design_id`** をそのまま流用。明示的な spec 発行 API は無い。
- 親→iframe 方向の通信（リサイズ・variant 変更通知など）は**未実装**。
- iframe viewport: `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`（[index.html](../index.html)）。iframe 内の DPR/サイズ調整ロジックは無し。
- 親へのリサイズ要請（例: `decocom:resize` 的な message）は送っていない。`aspect-ratio:4/3` は親側の固定値。

### 2.3 横断的な改善ポイント（UI 改修と並行で議論したい）

| 項目 | 現状 | 提案 |
|---|---|---|
| iframe アスペクト比 | `aspect-ratio:4/3`（横長） | モバイルでは縦長 or `min-height: 720px`、もしくは iframe→親リサイズ message を導入 |
| 親→iframe ハンドシェイク | 無し | `decocom:editor:ready` を iframe から送り、親が `parent_origin` を返す双方向化 |
| `embeddedParentOrigin` / `isShopifyEmbed` | tigers と garupan で1:1 重複 | `src/embed/shopify.ts` に集約 |
| postMessage origin 検証 | iframe 側は受信していない | 親→iframe を導入するなら同時に origin 制限 |

---

## 3. 改修方針 3案の評価

### 3.1 評価軸

- **実装コスト**: S（〜半日）/ M（1〜2日）/ L（3日以上）
- **UX 影響**: 編集セレクト領域の高さ拡張効果と、プレビュー視認性のバランス
- **リスク**: 既存レイアウトとの整合、ジェスチャ衝突、テスト容易性

### 3.2 案A: プレビュー縮小トグル（編集中はサムネ化）

**実装イメージ**:
- `useState<boolean>(false)` で `isPreviewCollapsed` を管理。
- `.tigers-preview-area` に `.is-collapsed` モディファイアを足し、CSS で `height: 80px` 等に縮小、`SelectedCaseInfoRibbon` のみ表示にする。
- ヘッダー右端 or プレビュー領域上に「▾ プレビューをたたむ / ▴ 開く」ボタンを追加。
- step が変わるたびにデフォルト状態をリセット（stamp は閉じ、layout/background は開くなど）。

**コスト**: **S** (半日〜1日)
- 触る範囲: `TigersEditor.tsx` 1ファイル、`TigersEditor.css` の `.tigers-preview-area` 周辺のみ。
- 既存の flex 構造を壊さない（`flex:0 0 auto` で高さだけ可変）。

**UX**:
- 編集中はセレクト領域が最大化（+340px 程度）してグリッドが広く使える。
- プレビュー確認は1タップで戻せる。
- ただし「タップ→確認→タップ→戻る」の往復が発生。

**リスク**: 低。アニメーションを足す場合のみ少し増える（`transition: height 0.2s ease`）。

### 3.3 案B: ボトムシート式（編集部分を上下スワイプで領域可変）

**実装イメージ**:
- `.tigers-editor__right` をボトムシート化（`position: absolute; bottom:0; height: var(--sheet-height)`）。
- ドラッグハンドル（横棒）に `onPointerDown / onPointerMove / onPointerUp` を付け、`--sheet-height` を CSS 変数で動的に更新。
- スナップ位置を3点定義（`30vh` / `60vh` / `90vh`）。
- プレビューは常時下に残し、シートが覆う範囲を可変に。

**コスト**: **M〜L** (2〜4日)
- pointer event ハンドラ実装。
- `flex` ベースのレイアウトを `position:absolute` に部分書き換え（モバイル専用 media query 内で）。
- iframe スクロールとの衝突（親ページがスクロールするケース）への対応。
- アクセシビリティ（キーボード操作、`aria-expanded` 等）。
- preview ページ（`PreviewScreen`）は別構造のためそのまま、エディタ画面のみ作り変え。

**UX**:
- 最も自由度が高い。ユーザーが好きな比率で操作可能。
- 端末・iframe サイズに依存しない柔軟性。
- 一方で「初見のユーザーがドラッグ可能と気づきにくい」問題が常につきまとう。

**リスク**: 中。iframe 内のジェスチャは親ページの慣性スクロールと干渉しやすい。Garupan 側は自由配置の pointer event があるため、共通基盤化したい場合の連携設計まで考えると L 寄り。

### 3.4 案C: ステップごとにプレビューサイズ可変

**実装イメージ**:
- 既存の `.is-step-stamp` モディファイア機構を踏襲して、`.is-step-layout` / `.is-step-background` を追加し、それぞれ `.tigers-preview-area` の `height` を変える。
- 案: stamp `200px` / layout `360px` / background `360px` などにチューニング。
- 必要なら preview SVG の最大幅も media query で増減（現在 mobile 180px）。

**コスト**: **S** (半日)
- CSS のみで完結する想定。`TigersEditor.tsx` には `className` の組み立てロジックを1行足す程度（`is-step-${currentStep}`）。

**UX**:
- ユーザー操作なしに各ステップで最適サイズになる「決め打ち」。
- stamp 時は `StampPreviewFull`（単発スタンプ画像）が大きすぎる現状を是正できる。
- layout/background はユーザーが見たい情報なので大きめ維持。
- ただし**「セレクト領域を広げたい」という根本要望には部分対応にとどまる**。stamp 時に 200px に縮めても、layout/background では結局狭いまま。

**リスク**: 低。

### 3.5 比較サマリ

| 案 | コスト | セレクト領域拡張 | 必要 UI 学習 | 推奨度 |
|---|---|---|---|---|
| A: プレビュー縮小トグル | S | ◎（明示的に最大化） | △（ボタン存在を伝える） | ★★★ |
| B: ボトムシート | M〜L | ◎（任意比率） | △（ドラッグ発見性） | ★★ |
| C: ステップ別固定高 | S | △（layout/bg では効果薄） | ◎（操作不要） | ★★ |
| **A+C 併用** | S+α | ◎ + 各ステップ最適化 | A の学習のみ | **★★★★（推奨）** |

---

## 4. 推奨案と理由

### 4.1 推奨: 案A + 案C のハイブリッド（Mobile 単一レイアウト化）

**理由**:

1. **ROI が高い**: 案A 単独で課題の本丸（編集領域の狭さ）を解決し、案C は CSS だけで「ステップ別の自然な見え方」を整える補強。合計でも S レベル工数。
2. **既存構造を壊さない**: 状態管理・コンポーネント分割は現状維持。CSS と1〜2個の state 追加で完結。Garupan 側との共通化議論を後回しにできる。
3. **ロールバック容易**: 機能フラグ的に `isPreviewCollapsed` を default false にすれば、見た目の追加変更だけで切り戻せる。
4. **B は将来オプション**: Shopify iframe のリサイズ通信を導入した後に検討する方が衝突リスクが低い。Garupan の自由配置（pointer event 設計）が安定してから共通基盤化する選択肢を残したい。

### 4.2 同時にやっておきたい付随作業

- **PC レイアウト撤去**: モバイル統一に振るなら、`.tigers-editor { display:flex }` のデフォルトと `@media (max-width:767px)` ブロックを反転させ、**モバイルをデフォルトにしてデスクトップで max-width: 480px センター寄せ**にする。これで「PC で崩れる」問題は構造的に消える。
- **iframe アスペクト比再検討**: `decocom_shopify_theme/sections/decocom-editor.liquid` の `aspect-ratio:4/3` をモバイル前提の縦長（例 `aspect-ratio: 3/4` または `min-height: 720px`）に変える。これは決定後 Shopify テーマ側 PR が別途必要。
- **iframe → 親 リサイズ message** の導入は別 PR で検討（将来の B 案や、より動的な高さ調整に必要）。

---

## 5. 改修ステップ分解（PR 単位）

各 PR は独立してマージ可能・ロールバック可能な単位で設計。

### PR 1: モバイル単一レイアウト化（PC レイアウト撤去）

**目的**: 「PC で崩れる」を構造的に解消、以降の改修をモバイル前提で進める下地。

**変更点**:
- `TigersEditor.css` の `.tigers-editor { display:flex }` を撤去（あるいは `flex-direction: column` をデフォルトに）。
- 既存 `@media (max-width:767px)` 内の指定をデフォルトに昇格。
- PC 幅では `max-width: 480px; margin: 0 auto; box-shadow` 程度のセンター寄せに。
- `.is-step-stamp .tigers-editor__left { flex: 3 1 0 }` 系の PC 用ルールを削除。

**確認**:
- iPhone SE / 14 Pro / iPad / デスクトップで `npm run dev` で目視確認。
- `/garupan` への副作用がないことを CSS スコープから確認（`tigers-` プレフィックスで隔離済み）。

**コスト**: S。

### PR 2: 案A プレビュー縮小トグル

**目的**: 編集セレクト領域を明示的に最大化できるようにする。

**変更点**:
- `TigersEditor.tsx` に `const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false)`。
- `.tigers-preview-area` に `${isPreviewCollapsed ? 'is-collapsed' : ''}` を付与。
- プレビュー領域右上に折りたたみトグルボタンを追加（aria-label / aria-expanded）。
- `TigersEditor.css` に `.tigers-preview-area.is-collapsed { height: 84px }` 等のスタイル追加。`SelectedCaseInfoRibbon` 以外を `display:none` にする。
- step 切替時の初期状態ロジック（任意）: stamp 時は collapsed、layout/background 時は expanded など。

**確認**:
- トグルで `tigers-selection-scroll` の高さが実際に拡張されること。
- preview ページ（`PreviewScreen`）には影響しないこと。

**コスト**: S。

### PR 3: 案C ステップ別プレビューサイズチューニング

**目的**: 各ステップで最適なプレビュー領域に。

**変更点**:
- `TigersEditor.tsx`: `<section className={`tigers-editor is-step-${currentStep}`}>` のように `is-step-${step}` を付与。
- `TigersEditor.css`:
  - `.is-step-stamp .tigers-preview-area { height: 200px }`
  - `.is-step-layout .tigers-preview-area { height: 320px }`
  - `.is-step-background .tigers-preview-area { height: 320px }`
- 必要なら `.tigers-design-preview__pixel9a-svg` の `width` 上限を step 別に。

**確認**:
- 案A の `is-collapsed` と組み合わせたとき、`is-collapsed` が勝つように specificity を確認。

**コスト**: S。

### PR 4（任意・別系統）: 埋め込みヘルパ共通化

**目的**: Tigers / Garupan / Pixel9a で重複している埋め込み判定を1箇所に。

**変更点**:
- `src/embed/shopify.ts` を新設し `embeddedParentOrigin()`, `isShopifyEmbed()`, `postDesignReady(payload, parentOrigin)` を実装。
- `TigersEditor` / `GarupanEditor` / `Pixel9aCaseMaskPreview` から重複コードを削除し、共通モジュールに置換。

**確認**:
- 3エディタすべての保存→postMessage を Shopify dev ストアで確認。

**コスト**: S。改修方針とは独立しているので、PR 1〜3 の前後どちらでも入れられる。

### PR 5（将来・別系統）: Shopify iframe アスペクト比の再設計

**目的**: 親側の `aspect-ratio:4/3` を見直し、モバイルで縦長エディタが収まる比率に。

**変更点**:
- `decocom_shopify_theme/sections/decocom-editor.liquid` の `iframe style` を変更。
- 必要に応じて、iframe → 親方向の `decocom:editor:resize` message を追加し、`iframe.style.height` を動的に更新するスクリプトをテーマに足す。
- decocom_editor 側で `useEffect` 内に `ResizeObserver` を仕込み、コンテンツ高を親へ通知。

**確認**:
- Shopify dev ストアで実際の iframe 内に収まるか実機検証。

**コスト**: M。テーマ側 PR と editor 側 PR の2本立て。

---

## 6. 未決事項（実装前に決めたい）

1. PR 1 でデスクトップ表示を「センター寄せのモバイルレイアウト」にするか、それともデスクトップは完全に切り捨て（`@media (min-width:768px)` で `display:none` 警告）するか。**推奨**: センター寄せ。低コストかつ社内動作確認に使える。
2. プレビュー縮小トグルのデフォルト挙動: 「常時開く」か「stamp 時のみ閉じる」か。**推奨**: 常時開いた状態でスタート、ユーザー操作で閉じる方式（驚き最小）。
3. step ごとの最適プレビュー高 (`200px` / `320px` 等の具体値) を Flutter 版と side-by-side で詰めるか、本 PR では仮値で出して PR レビュー時に微調整するか。
4. iframe アスペクト比の見直しを今回スコープに含めるか、UI改修完了後に別 PR とするか。**推奨**: 別 PR（PR 5 として後続）。
5. 案B を完全に却下するか、将来の検討項目として残すか。**推奨**: 残す（Garupan の自由配置 UX と共通基盤化する文脈で再評価）。

---

## 7. 参考リンク

- 既存実装: [src/tigers/TigersEditor.tsx](../src/tigers/TigersEditor.tsx) / [src/tigers/TigersEditor.css](../src/tigers/TigersEditor.css)
- ガルパン版（対比用）: [src/garupan/GarupanEditor.tsx](../src/garupan/GarupanEditor.tsx)
- Shopify 受信側: [decocom_shopify_theme/sections/decocom-editor.liquid](../../decocom_shopify_theme/sections/decocom-editor.liquid)
- 移植経緯: [docs/tigers_editor_migration.md](./tigers_editor_migration.md)
- 全体ロードマップ: [decocom_editor_roadmap.md](../decocom_editor_roadmap.md)
