# 印刷データ生成テストページ

作成日: 2026-05-09

## 概要

`/test/render` はログイン不要の印刷データ生成確認ページ。

Pixel 9a と `iphone-17-grip-case` の両方で、画像アップロード、配置調整、印刷PNG生成、生成結果URL確認までを行える。

## URL

```text
http://127.0.0.1:51710/test/render
```

## UI

縦並びで以下を表示する。

1. 機種セレクタ
2. 画像アップロード
3. プレビュー枠
4. X / Y / Scale / Rotation スライダー
5. 印刷データ生成ボタン
6. 生成結果プレビュー
7. `composed_image_url` のコピー

## 対応機種

| 表示名 | mode | variant/API |
|---|---|---|
| Pixel 9a | `legacy-pixel9a` | `POST /api/skia/render` |
| iPhone 17 グリップ | `variant` | `POST /api/products/iphone-17-grip-case/render` |

## 表示仕様

### Pixel 9a

- `PIXEL_9A_CASE_CLIP_PATH_D` をガイドとして表示する。
- 印刷PNG生成時は commerce 側で mask しない。

### iPhone 17 グリップ

- `GET /api/products/iphone-17-grip-case/print-spec` を取得する。
- `clip.svg` から `viewBox` を読み、プレビュー枠サイズに使う。
- `base_image_url` は画像として読み込み可能な場合だけ表示する。
- base image が 404 の場合、SVG内に `Not Found` を出さない。
- 印刷PNG生成時は commerce 側で mask しない。

## 生成フロー

1. ユーザーが画像を選択する。
2. editor がプレビュー用 object URL を作る。
3. `cover` 配置で初期 `placement` を作る。
4. スライダーで `centerX`, `centerY`, `scale`, `rotationRad` を調整する。
5. 「印刷データ生成」で画像を `/api/upload` へ送る。
6. 対象機種に応じて render API を呼ぶ。
7. `composed_image_url` を表示する。

## 注意

commerce のコード変更後は、`127.0.0.1:8000` の API プロセスを再起動する。

```bash
cd /Users/tokuhiroyui/decocom/decocom_all/decocom_commerce
EDITOR_ORIGIN=http://127.0.0.1:51710 .venv/bin/python -m uvicorn main:app --port 8000
```

