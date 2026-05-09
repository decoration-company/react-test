# editor 実装仕様書

作成日: 2026-05-09
対象リポジトリ: `decocom_editor`
関連: `decocom_commerce`（既存実装利用）, `decocom_shopify_app`（別タスク）

---

## 1. ゴール

自社Shopify（decoration-company）で editor → commerce → Shopify カート追加までを E2E で動作させる。

---

## 2. 全体フロー（確定版）

```
[ユーザー] 機種ページから editor を開く
  ↓ iframe src="...?variant=iphone-17-grip-case&embed=shopify&origin=..."
[editor]
  ↓ POST /api/upload         (画像アップロード)
[commerce] → source_image_url
  ↓
[editor] ユーザーが配置調整
  ↓ POST /api/products/{variant}/render  (印刷データ生成)
[commerce] → composed_image_url + preview_image_url
  ↓
[editor] 「カートに入れる」ボタン押下
  ↓ postMessage('decocom:design:ready', {...})
[Shopify Theme / shopify_app]
  ↓ Shopify カートに line item properties 付与して追加
[Shopify] → 購入 → orders/paid webhook
[commerce] → アリシア外部注文API（既存実装）
```

---

## 3. 確定仕様

### 3.1 variant の受け取り

editor は URL パラメータで `variant` を受け取る。

```
https://editor.decocom.jp/?variant=iphone-17-grip-case&embed=shopify&origin=https://decoration-company.myshopify.com
```

| パラメータ | 必須 | 用途 |
|---|---|---|
| `variant` | 必須 | 商品SKU。`commerce.products.variant` と一致 |
| `embed` | 任意 | `shopify` の場合 Shopify 埋め込みモード |
| `origin` / `parent_origin` | 任意 | postMessage 送信先オリジン |

### 3.2 印刷データ生成タイミング

**カート追加前に生成する（方式A）**

ユーザーが「カートに入れる」ボタンを押した時点で `POST /api/products/{variant}/render` を呼び、URL を取得してから postMessage を送る。

理由:
- 生成失敗時にカート追加させない、で完結する
- カート追加時点で「これが届く」が確定
- 既存実装が方式A前提で組まれている

### 3.3 commerce API 呼び出し（既存実装利用）

#### Step 1: 画像アップロード

```
POST /api/upload
Content-Type: multipart/form-data
Body: { file: File }
Response: { source_image_url: string }
```

#### Step 2: 印刷データ生成

```
POST /api/products/{variant}/render
Content-Type: application/json
Body: {
  source_image_url: string,
  placement: {
    centerX: number,
    centerY: number,
    imageWidth: number,
    imageHeight: number,
    scale: number,
    rotationRad: number
  }
}
Response: {
  design_id: string,
  composed_image_url: string,
  preview_image_url: string,
  width_px: number,
  height_px: number
}
```

`design_id` は受け取るが postMessage には載せない。

### 3.4 postMessage 仕様

```typescript
type ShopifyDesignReadyMessage = {
  type: 'decocom:design:ready'
  variant: string           // URLパラメータから受け取った値をそのまま
  preview_url: string       // commerce render の preview_image_url
  print_image_url: string   // commerce render の composed_image_url
}
```

送信先: URL パラメータ `origin` または `parent_origin` で指定されたオリジン。

`design_id` は含めない（Shopify 側で使い道がないため）。

### 3.5 Shopify line item properties（参考・shopify_app 側で実装）

editor が直接書き込むわけではないが、postMessage を受けた Shopify Theme / shopify_app が以下を line item properties に付ける想定。

```
properties[variant]: iphone-17-grip-case
properties[print_image_url]: https://...
properties[thumbnail_image_url]: https://...
```

---

## 4. 実装タスク

### 4.1 URLパラメータから variant を受け取る

**現状**: `Pixel9aCaseMaskPreview.tsx` が Pixel 9a 固定。`variant` を受け取る仕組みがない。

**やること**:
- App.tsx か router で `?variant=xxx` を読み取る
- `variant` から print spec（フォームファクタ、印刷スペック）を取得して動的にレンダリングできる構造にする
- 既存の `?mode=verify&variant=xxx` パターン（VerifyPreview）を参考にする

**補足**: `GET /api/products/{variant}/print-spec` は commerce 側に実装済み（`app/api/products.py:75`）。依存なし。

### 4.2 Shopify embed mode で commerce render を経由する

**現状**: `Pixel9aCaseMaskPreview.tsx:237-248` で TODO コメントが残っており、`composed_image_url` に `sourceImageUrl`（元画像のオブジェクトURL）が入っている。

**やること**:
- 「カートに入れる」ボタン押下時に `POST /api/products/{variant}/render` を呼ぶ
- レスポンスの `composed_image_url` と `preview_image_url` を postMessage で送る
- TODO コメントを削除

### 4.3 postMessage に variant を追加

**現状**: postMessage に `variant` が含まれていない。

**やること**:
- `ShopifyDesignReadyMessage` 型に `variant` を追加
- URLパラメータから受け取った値をそのまま載せる

### 4.4 エラーハンドリング

**やること**:
- `POST /api/upload` 失敗時の表示
- `POST /api/products/{variant}/render` 失敗時の表示
- 失敗時はカート追加ボタンを再活性化する

---

## 5. 依存タスク（editor 外）

editor 単独では完結しないので、並行で以下が必要。

| # | タスク | 担当 |
|---|---|---|
| 1 | 商品マスター schema の Supabase 適用確認 | commerce / Claude SQL |
| 2 | グリップケース初期データ投入（devices, products, product_print_specs, product_prices） | commerce / Claude SQL |
| 3 | ~~`GET /api/products/{variant}/print-spec` 等、editor 初期化に必要な API の有無確認~~ 実装済み確認済み | — |
| 4 | shopify_app 側で iframe 埋め込み + postMessage 受信 + カート追加 | shopify_app |

---

## 6. スコープ外

- 注文 → webhook → アリシア E2E（commerce 側で実装済み、UUUM案件で並行検証中）
- replay endpoint, retry, Slack 通知等の運用安定化（P2）
- 商品マスター Public API（P3）
- アリシア住所マッピング（外部協業）

---

## 7. 受け入れ基準

1. 自社Shopifyテストストアで以下が動く:
   - 機種ページから editor 起動（URLパラメータ `?variant=xxx` 経由）
   - 画像アップロード → 配置調整 → カート追加
   - Shopify カートに `variant` / `print_image_url` / `thumbnail_image_url` が line item properties として入る
2. iPhone 16 Pro グリップケースで先行検証する（既存方針と一致）
3. エラー時にユーザーに状態がわかる

---

## 8. 参照

- [_all/editor_status_2026-05-09.md](../../editor_status_2026-05-09.md)（現状調査ドキュメント）
- [decocom_commerce/docs/id_system_decisions.md](../../decocom_commerce/docs/id_system_decisions.md)
- [decocom_commerce/docs/product_master_implementation_plan.md](../../decocom_commerce/docs/product_master_implementation_plan.md)
- [decocom_commerce/decocom_image_generation_strategy.md](../../decocom_commerce/decocom_image_generation_strategy.md)
