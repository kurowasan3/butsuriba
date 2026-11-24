# ぶつりば（大学物理）

ぶつりばは、答えを見せるのではなく、自力で立式して解ける頭をつくる大学物理の演習アプリです（v0.7）。
受験数学アプリ [Lemma](https://github.com/kurowasan3/lemma)（v0.26）と同じエンジン・同じ仕組みで動き、問題と画面の一部だけが物理用です。
iPhone・iPad のブラウザで動き、ホーム画面に追加するとアプリとして使えます（PWA）。

**収録**：19科目＋融合・121分野・9,423問。v0.6 までの118分野は、基礎・標準・演習・院試・院試難関 がそれぞれ3問以上。
v0.7 で外部の問題管理表から 7,650問（演習書の類題）を取り込んだ。こちらは標準〜院試が中心で、小問の一部だけ自動採点のものが多い（読み取れない小問は自己採点）。

物理数学 → 力学 → 振動・波動 → 解析力学 → 連続体力学 → 電磁気学 → 特殊相対論 → 熱力学 → 統計力学 → 量子力学 → 実験学 →
固体物理学 → 生物物理学 → 原子核物理学 → 相対論的量子力学 → 場の量子論 → 素粒子物理学 → 一般相対論 → 宇宙物理学 → 融合問題

難易度：0=基礎（意欲的な高校生でも解ける）・1=標準・2=演習・3=院試・4=院試難関。
難易度とは別に **頻出度**（高・中・低）がある。物理の多くの場面・院試で繰り返し使う考え方を扱う問題ほど高く、演習ではまだ解いていない問題のうち頻出度の高いものを優先して出す。

## できること（Lemma と同じ）

- **今日の学習**：今日解いた数／目標、中断した演習の「前回の続き」、復習待ちを先に新しい問題で埋める「今日の演習を始める」、「類題を1問追加」
- **全分野ランダム／分野ごとに演習／復習**（忘れ方を問題ごとに推定）、**段階ヒント**、**自信度**
- **答えを入力して自動採点**（書き方が違っても同じなら正解）。**解答の形式**を 記述式・選択式（4択）・自己採点 から選べる
- **判定がおかしい？**、**計算トレーニング**、**グラフ電卓**（2D・3D・複素数平面・ベクトル）、**問題を解きながらグラフ**
- **定着度**（科目のレーダー図・分野の色分け）、**検索**（タグの別名もまとめて）、**問題セット**、**ブックマーク**
- **アカウントと同期**（メールのコード。Lemma と共通のアカウント）、**記録の書き出し・読み込み・消去**、オフライン動作、ライト／ダーク

### ぶつりばだけのもの

- **物理の記号で答えを入力**：添字（`m_1`・`m1`・`ω_0`・`k_B`・`r_+`・`v_⊥`）、ダッシュ（`x'`）、ギリシャ文字（`omega` でも `ω` でも）、`hbar`／`ħ`、指数表記（`6.6e-34`）、`cot`・`sec`・`coth`・`sech`・`arsinh` など
- **近似値の採点**：入力用の答えに `≈` を付けた数値は相対誤差 2% まで正解（`≈1.2e5 (5%)` で幅を指定）。選択式では誤答にも ≈ が付く
- **単位**：ラベルに `[s]` と書くと入力欄に単位が出る。答えの後ろに同じ単位を付けても正解
- **計算トレーニング**：オーダー評価・ベクトル解析・行列と固有値・物理の積分・近似と展開
- **グラフの例**：減衰振動・共鳴曲線・有効ポテンシャル・プランク分布・フェルミ分布・ロジスティック写像・円柱まわりの流線 など
- マスコットは猫の **シュレ**（シュレーディンガーの猫から）

### まだ無いもの

- **解法カード**（Lemma の「解法から選ぶ」と、解法ごとの習熟度による推薦）：仕組みは入っているが、物理のカードはまだ 0 枚。
  カードが無いあいだは「解法から選ぶ」は出ず、「今日の演習」は復習の時期・新しい問題・苦手分野から選ぶ。
  作るときは `content/techniques.json` に Lemma と同じ形式で書き、`python3 tools/build_app_data.py`（`docs/techniques.md`）
- **問題の図**：問題文から自動で図を選ぶ機能は、物理の問題文では的外れな図が出やすいので使わない。図が要る問題は管理表の「図の式」列に書く

## 問題管理表から問題を取り込む

問題は `ぶつりば問題管理表.xlsx`（問題一覧シート）で管理し、「正規データ `content/`」と「アプリ用データ `data/`」に変換します（形式は [docs/data-spec.md](docs/data-spec.md)）。

```sh
pip3 install openpyxl jsonschema sympy antlr4-python3-runtime==4.11
python3 tools/import_xlsx.py ぶつりば問題管理表.xlsx   # content/ と data/ を作り直す（選択式の選択肢も）
node tests/run.mjs                                   # 検査（全部 ✓ になればOK）
```

- 分野ID（`ME-07` など）は `content/taxonomy.json` で固定。ぶつりば v0.4 までと同じ ID なので、前の学習記録がそのまま使える
- 問題ID（`ME-01-001` など）は変えない・消さない（`tests/golden/ids.txt` と照合）。出さない問題はタグに `非表示`
- 新しい分野を足すときは `tools/physics_fields.py` の `EXTRA_FIELDS` に足し、`--new-fields` を付けて取り込む
- 「頻出度」列（1〜3 または 低・中・高）は空欄なら `content/values.json` の判定を使う。「解法」列は解法カードを作ってから
- 問題セット：`content/collections/` に JSON を置いて `python3 tools/build_app_data.py`
- 「参考元（非公開）」「メモ」などは `private/sources.json`（リポジトリに入れない）に置き、`make_xlsx.py` が管理表に書き戻す
- タグの言い換え：`content/tags.json` の `aliases`

新しい問題を作るときは `tools/PROBLEM_GUIDE.md` に従い、`python3 tools/validate_new.py new/〇〇.json` で検査し、`python3 tools/make_xlsx.py` で管理表に入れます（既存の問題の ID は変わりません）。

### 入力用の答え（T列）

```
(1) ω：sqrt(g/l)                   ← 小問ごとに1行、ラベルは全角「：」
(2) 周期 [s]：≈2.01                ← ≈ は近似値（2%）、[ ] は単位
(3) μ：m_1 m_2/(m_1+m_2) ; E：hbar omega/2
(4) {1/2, -1/2}                    ← { } は順不同、( ) は順序あり、1:2 は比、0<x<1 は範囲
(5) 場合分け{ T<T_c → … | T>=T_c → 0 }
(6) 記述：要点                      ← 証明・導出・説明は自己採点
```

変数は1文字（＋添字）だけ。`ab` は a×b。`e` はネイピア数、`E` は変数（電気素量は `q` を使う）。

## アカウントと同期（Supabase）

アカウントは Lemma と共通の Supabase プロジェクト「lemma」を使い、学習記録はアプリごとに別の表に保存します（Lemma は `lemma_state`、ぶつりばは `butsuriba_state`）。

1. Supabase の SQL Editor で `supabase/schema.sql` を1回実行（表 `butsuriba_state` と RLS）
2. 続けて `supabase/guard.sql` を実行（サーバー側の検査。Lemma と同じ関数をこの表にもつなぐ）。
   Lemma 側で guard.sql の新しい版を適用済みなら、末尾のトリガーの行だけを実行する（`select lemma_private.guard_version();` で版を確認）
3. 接続先は `js/config.js`（Lemma と同じ Project URL と Publishable key）

- 同じメールアドレスなら Lemma と同じアカウントになる。退会するとアカウントごと消えるので、Lemma の記録も消える（画面とプライバシーポリシーに明記）
- 認証メールの文面はプロジェクトで1つ。アプリ名を出さない共通の文面にしておく（`docs/architecture/mathel-integration.md` §2）
- 端末の記録は `lemma-physics.v1` に保存（ぶつりば v0.4 までと同じ名前。同じ URL なら前の記録がそのまま使える）

## 公開する

`main` に push すると GitHub Actions が検査（`node tests/run.mjs --e2e`）を行い、通ったら配信用の `dist/`（アプリ本体と `data/` だけ）を配置します（`.github/workflows/ci.yml`）。

- **GitHub Pages**（既定）：リポジトリの Settings → Pages → Source を「**GitHub Actions**」にする。`https://kurowasan3.github.io/butsuriba/` で開ける。
  `content/`・`tools/`・`tests/` は配信されない
- **Cloudflare Pages**（Lemma と同じ）：Variables `CF_PAGES_PROJECT`、Secrets `CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID` を登録すると、GitHub Pages の代わりにこちらに配置する。
  `dist/_headers` の CSP などのセキュリティヘッダーは Cloudflare Pages でだけ効く
- 更新したら `sw.js` の `VERSION` を上げる（端末のキャッシュが入れ替わる）

全問題の「問題 → 解答」PDF（科目ごと、1ページに1問、しおり付き）は `node tools/make_pdf.cjs data pdf && python3 tools/merge_pdf.py pdf` で `pdf/` に作れます。

ローカルで試すときは `python3 -m http.server` を実行して `http://localhost:8000` を開きます。

## 構成

Lemma と同じ（`js/`・`content/`・`data/`・`tools/`・`tests/`・`supabase/`・`docs/`）。ぶつりばで足した・変えたもの：

```
tools/physics_fields.py   科目・分野・難易度の一覧（取り込みの入口）
tools/make_xlsx.py        new/*.json → 問題管理表
tools/PROBLEM_GUIDE.md    問題の作り方
new/                      問題の元データ（検査済み JSON）
content/values.json       頻出度の判定
content/collections/      問題セット（基礎ひとまわり・標準ミックス・院試の主要4科目・保存則と対称性）
js/parser.js・answer.js   物理の記号・近似値・単位
js/drill.js・ui.js        計算トレーニング・猫のシュレ
```

`docs/` は Lemma の設計書で、ぶつりばのエンジンと共通です（例は受験数学のもの）。

## 設計の根拠

- 想起練習・分散学習：Dunlosky et al. (2013), *Psychological Science in the Public Interest*
- 交互練習：Rohrer et al. (2020), *Journal of Educational Psychology*
- 答えを出さないAI支援：Bastani et al. (2025), *PNAS*

大学物理（とくに院試レベル）での効果は未検証です。
