# decocom_editor

全販路共通のエディタ＋IPホルダー向け管理画面（Vite + React + TypeScript）。

いまの作業内容としては **Pixel 9a の「ケース用マスク」プレビュー**が `src/pixel9a/` にあります。

## 起動方法（開発）

このディレクトリ（`decocom_editor/`）で実行します。

```bash
npm install
npm run dev
```

- 開発サーバは通常 `http://localhost:5173` で起動します（出力ログにURLが出ます）。

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
