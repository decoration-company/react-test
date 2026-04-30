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

## メモ（テンプレ由来）

ベースは React + TypeScript + Vite テンプレです。
