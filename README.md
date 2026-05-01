# decocom_editor

全販路共通のエディタ＋IPホルダー向け管理画面（Vite + React + TypeScript）。

いまの作業内容としては **Pixel 9a の「ケース用マスク」プレビュー**が `src/pixel9a/` にあります。

## 起動方法（開発）

このディレクトリ（`decocom_editor/`）で実行します。

初回は環境変数を用意します。

```bash
cp .env.example .env.local
```

`VITE_COMMERCE_API_BASE_URL` は、ローカルの `decocom_commerce` を使う場合は `http://localhost:8000` のままでOKです。

```bash
npm install
npm run dev
```

- 開発サーバは通常 `http://localhost:5173` で起動します（出力ログにURLが出ます）。

## ローカル開発（HTTPSトンネル）

Shopify の iframe からローカルの editor を表示する場合は HTTPS の公開URLが必要です。
ngrok 無料版は iframe 内で警告ページを突破できないため、Cloudflare Tunnel を推奨します。

```bash
brew install cloudflared
```

editor の dev server と並行して、別ターミナルで Cloudflare Tunnel を起動します。

```bash
cloudflared tunnel --url http://localhost:5173
```

出力された `https://xxxx.trycloudflare.com` を Shopify app embed の `Editor URL` に設定します。

注意:
- editor の dev server（`npm run dev`）と `cloudflared` は並行起動が必要です。
- `vite.config.ts` の `server.allowedHosts` には `.trycloudflare.com` を追加済みです。
- ngrok 用の `.ngrok-free.dev` も残しており、両対応です。

### Shopify embed 時の挙動

Shopify app embed から起動された場合、URLパラメータの `embed=shopify` または `platform=shopify` を見てShopify連携モードに入ります。

Shopify連携モードでは、Phase 2の動作確認を優先して `uploadImage()` / `renderDesign()` は呼びません。つまりローカルの `decocom_commerce` やアリシアAPIには接続せず、editorが仮の `spec_id` とblob URLを即座に親のShopify商品ページへ `postMessage` します。

送信するmessage typeは `decocom:design:ready` で、現在は以下のような値を返します。

- `spec_id`: `spec_dev_xxxxxxxxxxxx`
- `design_id`: `spec_id` と同じ仮値
- `preview_url`: editorが生成したblob URL
- `composed_image_url`: `preview_url` と同じblob URL

TODO:
- 本番時は `decocom_commerce` 経由でデザインデータを保存し、正式な `spec_id` を発行する。
- preview / composed image はblob URLではなく、Shopify webhook後の処理でも参照できる公開URLにする。

## Pixel 9a 印刷PNG生成 E2E

Pixel 9a画面では、画像選択 → マスク内で移動・拡大縮小・回転 → `decocom_commerce` で印刷用PNG生成、までを確認できます。

先に `decocom_commerce` 側を起動します。

```bash
cd ../decocom_commerce
python3 -m uvicorn main:app --port 8000
```

その後、このリポジトリで開発サーバを起動します。

```bash
npm run dev
```

ブラウザで画像を選び、位置を調整して「印刷PNG生成」を押すと、`commerce` の `/api/upload` と `/api/skia/render` を呼び出し、生成された `composed_image_url` とプレビュー画像を画面に表示します。

注意:
- `decocom_commerce` 側のSupabase Storage `uploads` / `composed` bucket と `designs` テーブルが必要です。
- ローカルで `127.0.0.1:5173` を使う場合も、commerce側CORSで許可済みです。

## ビルド / プレビュー

```bash
npm run build
npm run preview
```

## どう動いてる？（ざっくり構造）

- **エントリポイント**
  - `index.html` が `src/main.tsx` を読み込み
  - `src/main.tsx` → `src/App.tsx` をマウント
- **主なコード**
  - `src/App.tsx`: 画面のルート
  - `src/pixel9a/`: Pixel 9a マスク関連（プレビュー等）
- **スタイル**
  - `src/index.css`, `src/App.css`

## よく使うコマンド

```bash
npm run lint
```

## 残課題

実運用に向けた未対応項目。

1. blob URL は一時的（ブラウザを閉じると失効）なので、`decocom_commerce` 経由で公開URL化する。
2. `spec_dev_xxx` は仮値なので、`decocom_commerce` 側でデザインデータ保存後に正式な `spec_id` を発行する。
3. editor は現在 Pixel 9a のみ対応。ほかの機種へ展開する。
4. チェックアウト → 注文 → webhook → アリシア連携のE2Eは未確認。
5. UUUM軸（editor不使用、メタフィールド2つ + `featured_image`）の動作確認は未実施。
6. ngrok用の `allowedHosts` は残置中。不要になったら整理する。

## メモ（テンプレ由来）

ベースは React + TypeScript + Vite テンプレです。
