# グリップケース SVG レイヤー命名規則

最終更新: 2026-05-27

## 概要

グリップケースは手帳型と同じく、Illustratorのレイヤー名でパーツを識別し、SVG内の位置情報を保持したまま書き出す方式に統一する。

書き出し構成：**base_image.png（ケース実写）+ clip.svg（パーツ一式）** の2ファイル。

外注納品時は、本書の **カメラ穴（白蓋path禁止）** と **納品前セルフチェック** を必ず守ること。

---

## 親レイヤー名

最上位レイヤー名は **variant と一致させる**。

例（iPhone 17のグリップケース）：

```
iphone-17-grip-case          ← 親レイヤー（variant）
  ├─ base_image
  ├─ print_area
  ├─ safe_area
  └─ bleed_area
```

variant命名規則：`{機種}-{タイプ}-{バリエーション}`、小文字+ハイフン、prefixなし。

---

## 推奨レイヤー構成（フラット1階層）

```
base_image          ← ケース実写（PNG書き出し用、SVG書き出し時は非表示）
print_area          ← 青_印刷部分外寸（カメラ穴等のくりぬきも含む）
safe_area           ← 赤_デザイン安全圏
bleed_area          ← 緑_塗りたし
```

**ポイント：**

- レイヤーをグループ化せず、フラットに並べる（書き出し後は `id="print_area"` 等のグループ／要素になる）
- レイヤー名がそのままSVGの `id` になる
- 「書き出し時_◎マーク消去」「デザイン作成」などの重複・作業用レイヤーは削除してから書き出す
- カメラ穴は **`print_area` 内で evenodd 複合パス** で表現する（後述）

---

## 推奨レイヤー命名

| 役割 | レイヤー名 | 書き出し先 | 備考 |
|------|----------|----------|------|
| ケース実写画像 | `base_image` | base_image.png | 別ファイルで書き出し |
| 印刷部分外寸（青） | `print_area` | clip.svg | 印刷可能領域。カメラ穴のくりぬきもここに含める |
| デザイン安全圏（赤） | `safe_area` | clip.svg | デザイン配置の安全圏 |
| 塗りたし（緑） | `bleed_area` | clip.svg | 塗りたし領域 |

---

## カメラ穴の作り方（重要）

### やっていいこと（OK）

- **複合パス**で外周と内周（カメラ穴）を **1つの `<path>`** にまとめる
- 穴抜きは **`fill-rule="evenodd"`**（Illustrator 書き出し後も維持されること）
- カメラ穴ごとに「外枠 path + 内枠 path」を別要素にせず、可能な限り **複合パス1本** に統合する

例（概念）：

```xml
<g id="print_area">
  <path fill-rule="evenodd" d="M...外周... M...内周（穴）... M...別の穴..." />
  <!-- 他の補助 path が必要なら、白塗りではなく evenodd で穴を表現 -->
</g>
```

### やってはいけないこと（NG）— 白蓋path

- 穴の「中身」を **白（`#fff` 等）で塗った path** で隠す方法
- 本仕様ではこれを **「白蓋path」** と呼び、**禁止**

### 理由（decocom editor 側の挙動）

editor の clip パーサは、`print_area` 内の **すべての `<path>`** を対象に、プレビュー用マスク生成時に **`fill="#000"`（黒）で union** する。

そのため、Illustrator 上では白く見えて穴が開いているように見えても、

1. 白蓋pathも path として数えられる  
2. 実行時に **黒塗りに変換** される  
3. 結果として **カメラ穴が塞がる**

commerce の render（Skia）経路でも、clip SVG から path を抽出するため、**白蓋は正しい穴抜きにならない**。

---

## 正解例・不正解例

### 正解例（リポジトリ内サンプル）

**正本パス（Storage 配置と同じ相対構造）：**

[decocom_assets/devices/iphone-17/grip-case/iphone-17-grip-case_clip.svg](../../decocom_assets/devices/iphone-17/grip-case/iphone-17-grip-case_clip.svg)

- ファイル名・レイヤー `id`（`print_area` / `safe_area` / `bleed_area`）・viewBox はこの形に合わせる
- **`print_area` 内に白蓋path（`fill:#fff` 等）が無いこと**
- カメラ穴は **evenodd 複合パス**（path 数は機種ごとの基準値に収める）

### 不正解例 — 外注納品（修正前）

実ファイル（検証・差分用）：

[docs/snapshots/thumbnail_check_20260519/iphone-17-grip-case_clip.svg](../../docs/snapshots/thumbnail_check_20260519/iphone-17-grip-case_clip.svg)

**構造上の問題（簡潔）：**

| 項目 | 修正前の外注納品 |
|------|------------------|
| カメラ穴 | 外周 path（青）+ 内周 path（青）+ **穴を塞ぐ白塗り path（白蓋）** がセットになっている |
| `print_area` 内 path | iPhone 17 では **6本** あるが、うち **2本が `fill:#fff` の白蓋** |
| 見た目 | Illustrator / ブラウザでは穴が開いて見える場合がある |
| decocom | editor パーサ・render の clip 抽出で **穴が閉じる** |

白蓋の見分け方：`print_area` グループ内で `style="fill: #fff"` や `fill="#ffffff"` の `<path>` がある。

---

## 納品前セルフチェック（path 数）

`print_area` 直下（または `id="print_area"` 要素の直下）の **`<path>` 要素数** は機種ごとに固定値がある。  
**基準より多い** ときは、白蓋path や重複 path の混入を疑う。

| 機種（例） | `print_area` 内 path 数（正） | 要調査 |
|------------|-------------------------------|--------|
| iPhone 17（`iphone-17-grip-case`） | **6** | **7 以上** |

### チェック手順

1. `clip.svg` をテキストエディタまたはスクリプトで開く
2. `id="print_area"` の直下にある `<path>` を数える
3. 次を確認する  
   - path 数が機種の基準値と一致するか  
   - **`fill:#fff` / `fill:#ffffff` / `fill: white` の path が無いか**  
   - カメラ穴が **evenodd 複合パス** になっているか（白蓋で穴を表現していないか）

### コマンド例（ローカル）

```bash
# path 数（Python 3）
python3 -c "
import xml.etree.ElementTree as ET
from pathlib import Path
p = Path('iphone-17-grip-case_clip.svg')
root = ET.parse(p).getroot()
pa = next(el for el in root.iter() if el.get('id') == 'print_area')
print('print_area paths:', len(list(pa)))
"

# 白蓋の有無（簡易）
grep -E 'id=\"print_area\"|fill:\s*#fff|fill=\"#fff\"|fill:#fff' iphone-17-grip-case_clip.svg
```

新機種を追加するときは、**正しい1機種分を計測して本表に追記**すること。

---

## Illustrator 書き出し

### 共通

- **アートボードサイズ = 書き出しサイズ**
- **viewBox はアートボード基準**で固定
- 各パーツがバラバラの座標でも、viewBox基準で正しく重なる

### カメラ穴を evenodd 複合パスにする手順

1. 外周と内周（穴）を選択
2. **オブジェクト → 複合パス → 作成**
3. 穴抜きになることを確認（穴の中が透ける）
4. 必要なら **ウィンドウ → アピアランス** 等で `evenodd` 相当の穴抜きルールを確認
5. **白で塗った「蓋」path を置かない**（NG）

登録オペレーションの手順書は [gripcase_registration_workflow.md](../../decocom_commerce/docs/operations/gripcase_registration_workflow.md) を参照（本書と矛盾しないよう両方更新する）。

### base_image.png

1. `base_image` 以外のレイヤーを非表示
2. ファイル → 書き出し → スクリーン用に書き出し（または同等）
3. 形式：PNG、スケール：1x
4. ファイル名：`{variant}_base.png`

### clip.svg

1. `base_image` を非表示、`print_area` / `safe_area` / `bleed_area` を表示
2. ファイル → 書き出し → 書き出し形式（または スクリーン用に書き出し）
3. 形式：SVG
4. SVGオプション：
   - スタイル：内部CSS
   - **「レイヤー名を使用」ON**（`id` 属性に反映）
5. ファイル名：`{variant}_clip.svg`
6. 書き出し後、上記 **納品前セルフチェック** を実施

---

## ファイル命名

| ファイル | 用途 |
|----------|------|
| `{variant}_base.png` | ケース実写 |
| `{variant}_clip.svg` | SVGパーツ一式 |

例（iPhone 17）：

- `iphone-17-grip-case_base.png`
- `iphone-17-grip-case_clip.svg`

Storage 配置例：`product-print-specs/{device_code}/grip-case/{variant}_clip.svg`（[grip_case_bulk_registration.md](../../decocom_commerce/docs/grip_case_bulk_registration.md) 参照）

---

## 運用

- 手帳型と同様、commerce では `product_print_specs.print_area_svg_url` / `base_image_url` で参照
- Alicia では `dc_m_items_2.case_clip_svg_url` にファイル名のみ（例：`iphone-17-grip-case_clip.svg`）

---

## CI 検証（将来追加予定）

リポジトリ CI では、次を **将来** 自動検証する予定（未実装）：

| 検証項目 | 内容 |
|----------|------|
| `print_area` 内 path 数 | 機種マスタと照合し、基準値超過で失敗 |
| `fill-rule` | カメラ穴を含む path で `evenodd` が付与されているか |
| 白蓋path | `print_area` 内に `fill:#fff` 系の path が無いか |

実装までは、外注納品時の **人手セルフチェック（上記）** を必須とする。

---

## 関連ドキュメント

| ドキュメント | 役割 |
|--------------|------|
| [gripcase_registration_workflow.md](../../decocom_commerce/docs/operations/gripcase_registration_workflow.md) | Illustrator → 書き出し → 登録の手順 |
| [grip_case_bulk_registration.md](../../decocom_commerce/docs/grip_case_bulk_registration.md) | commerce / Alicia 一括登録 |
| [grip_case_print_rendering.md](../../decocom_commerce/docs/grip_case_print_rendering.md) | render API・Storage |
| [grip_case_debug_memo_20260526.md](../../docs/snapshots/grip_case_debug_memo_20260526.md) | 不具合切り分けメモ |
