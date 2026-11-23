// ブラウザでの通し操作（Playwright・Chromium、iPhone 幅 390×844）
//   node tests/e2e.mjs
// 主な画面と、v0.6 の学習記録の引き継ぎ、一部のデータだけ古いときの警告を確かめる。
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createMockSupabase } from './mock-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
let fakeDataVersion = null;
const mock = createMockSupabase({ key: 'sb_publishable_e2e' });   // 同期のテスト用（このサーバーの /mock/ で応える）   // Service Worker のテスト用：index.json の dataVersion を差し替える
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p.startsWith('/mock/')) {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', async () => {
      const r = await mock.handle({ method: req.method, url: req.url, headers: req.headers, body: body || null });
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(r.body);
    });
    return;
  }
  if (p === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    const v = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8').match(/FILE_VERSION = '([^']+)'/)[1];
    return res.end(`export const FILE_VERSION = '${v}';
export const SUPABASE_URL = 'http://localhost:${server.address().port}/mock';
export const SUPABASE_KEY = 'sb_publishable_e2e';`);
  }
  if (fakeDataVersion && p === '/data/index.json') {
    const d = JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); d.dataVersion = fakeDataVersion;
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(d));
  }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const U = `http://localhost:${server.address().port}/`;

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const browser = await chromium.launch();

async function newPage({ state = null, raw = null, route = null, sw = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: sw ? 'allow' : 'block' });
  if (state || raw !== null) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('lemma-physics.v1', s); } }, raw !== null ? raw : JSON.stringify(state));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  if (route) await route(page);
  return page;
}
const next = (page) => page.locator('button:has-text("次")').first().click();

// ぶつりばの問題データから、テストに使う問題（入力用の答えが単純なもの。data/f-*.json で確認済み）
const INDEX = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8'));
const FIELD_OF = Object.fromEntries(INDEX.problems.map(p => [p.id, p.f]));
const FIELD = Object.fromEntries(INDEX.fields.map(f => [f.key, f]));
const fieldChip = (id) => `${FIELD[FIELD_OF[id]].subject}・${FIELD[FIELD_OF[id]].name}`;
const P1 = 'PM-08-001', P1_ANS = ['3', '2', '6'];      // (1) 3 (2) 2 (3) 6
const P2 = 'PM-06-006', P2_ANS = ['-3', '1'];          // (1) a：-3 (2) 1
const P3 = 'PM-08-002', P3_ANS = ['0', '3', '4'];      // (1) 0 (2) 3 (3) 4
const P1_FILE = `data/f-${FIELD_OF[P1]}.json`;
const FIXTURE = 'tests/fixtures/state-v0.6.json';       // v0.6 の記録（問題 ID をぶつりばのものに置き換えた版）
const TECHS = JSON.parse(fs.readFileSync(path.join(root, 'data/techniques.json'), 'utf8')).techniques || [];
const FIG_IDS = (() => {   // 問題の図（fg）がある問題（今は無い）
  const out = [];
  for (const f of fs.readdirSync(path.join(root, 'data')).filter(f => /^f-.*\.json$/.test(f))) {
    const d = JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
    for (const [id, b] of Object.entries(d)) if (id !== '_meta' && b.fg) out.push({ id, fg: b.fg });
  }
  return out;
})();

try {
  // 1. 起動・今日・入力採点・判定がおかしい？・3問目の分野チップ（ぶつりばに内蔵問題は無い）
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    ok(await page.locator('#lv button').count() === 5, '難易度ボタンが5つ（基礎〜院試難関）');
    ok((await page.locator('#lv button').allInnerTexts()).join() === '基礎,標準,演習,院試,院試難関', `難易度名（${await page.locator('#lv button').allInnerTexts()}）`);
    ok((await page.locator('.kicker').first().innerText()).includes('ぶつりば · 大学物理'), 'ホームに「ぶつりば · 大学物理」');
    ok(await page.locator('.banner').count() === 0, '起動時に警告が出ない');
    await page.evaluate(`__lemma.open(['${P1}', '${P2}', '${P3}'])`); await page.waitForTimeout(800);
    ok((await page.locator('.chip').allInnerTexts()).some(t => t.includes('入力して採点')), '入力して採点のチップ');
    ok((await page.locator('.chip.val').allInnerTexts()).some(t => /頻出度 [高中低]/.test(t)), '頻出度のチップ');
    ok((await page.locator('.chip').allInnerTexts()).some(t => t.includes(fieldChip(P1))), `分野チップ（${fieldChip(P1)}）`);
    await page.locator('#conf button').nth(2).click();
    const inputs = page.locator('#inputs input');
    ok(await inputs.count() === P1_ANS.length, `${P1} の入力欄が ${P1_ANS.length}つ`);
    for (let i = 0; i < P1_ANS.length; i++) await inputs.nth(i).fill(P1_ANS[i]);
    await page.click('#judge'); await page.waitForTimeout(500);
    ok((await page.locator('.verdict').innerText()).includes('完答'), `${P1} を正しく答えて完答`);
    await next(page); await page.waitForTimeout(600);
    await page.locator('#conf button').nth(1).click();
    await page.locator('#inputs input').nth(0).fill(P2_ANS[0]);
    await page.locator('#inputs input').nth(1).fill('2');   // 2つ目だけ違う
    await page.click('#judge'); await page.waitForTimeout(400);
    ok((await page.locator('#feedback').innerText()).includes('2つのうち1つ正解'), '一部だけ正しいと「2つのうち1つ正解」');
    await page.click('#giveup'); await page.waitForTimeout(400);
    await page.locator('.dispute').first().click(); await page.waitForTimeout(300);
    ok((await page.locator('.verdict').innerText()).includes('完答'), '判定がおかしい？で完答に変わる');
    await next(page); await page.waitForTimeout(600);
    ok((await page.locator('.chip').allInnerTexts()).some(t => t.includes(fieldChip(P3))), `3問目 ${P3} の分野チップ（${fieldChip(P3)}）`);
    ok(await page.locator('#conf button').count() === 3, '3問目にも自信度ボタン');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')));
    ok(st.pstat[P1] && st.pstat[P2], '結果が問題ID で記録される');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 2. 基礎だけのセット・計算・設定（テーマ・CSV）・グラフ・定着度
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    // 基礎（data-l=0）だけを選んだ状態にする
    if (!(await page.locator('#lv button[data-l="0"].on').count())) await page.click('#lv button[data-l="0"]');
    for (const k of ['1', '2', '3', '4']) if (await page.locator(`#lv button[data-l="${k}"].on`).count()) await page.click(`#lv button[data-l="${k}"]`);
    ok((await page.locator('#lv button.on').allInnerTexts()).join() === '基礎', '難易度を基礎だけにできる');
    await page.click('#todaygo'); await page.waitForTimeout(1200);
    ok((await page.locator('.chip').allInnerTexts()).includes('基礎'), '基礎だけ選ぶと基礎の問題が出る');
    await page.goto(U + '#drill'); await page.waitForTimeout(600);
    await page.locator('.drill-card').first().click(); await page.waitForTimeout(500);
    ok(await page.locator('.drill input').count() > 0, '計算トレーニングが始まる');
    await page.goto(U + '#settings'); await page.waitForTimeout(600);
    await page.locator('.segment.theme button:has-text("ダーク")').click();
    ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'ダークモード');
    await page.goto(U + '#graph'); await page.waitForTimeout(800);
    ok(await page.locator('canvas').count() > 0, 'グラフ画面');
    await page.goto(U + '#map'); await page.waitForTimeout(600);
    ok((await page.locator('#view').innerText()).includes('定着度'), '定着度画面');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 3. v0.6 の学習記録を入れた端末
  {
    const old = JSON.parse(fs.readFileSync(path.join(root, FIXTURE), 'utf8'));
    const page = await newPage({ state: old });
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.goto(U + '#map'); await page.waitForTimeout(600);
    await page.goto(U + '#settings'); await page.waitForTimeout(600);
    const dl = page.waitForEvent('download');
    await page.click('#csvall');
    const csv = fs.readFileSync(await (await dl).path(), 'utf8');
    ok(csv.split('\n').filter(l => l.trim()).length === old.log.length + 1, `CSV に v0.6 の記録 ${old.log.length}件がすべて出る`);
    await page.evaluate(`__lemma.open(['${P1}'])`); await page.waitForTimeout(800);
    await page.locator('#conf button').nth(1).click();
    const all = page.locator('#inputs input');
    const wrong = ['4', ...P1_ANS.slice(1)];   // 1つ目だけ違う
    for (let i = 0; i < wrong.length; i++) await all.nth(i).fill(wrong[i]);
    await page.click('#judge'); await page.waitForTimeout(300);
    await page.click('#giveup'); await page.waitForTimeout(300);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')));
    ok(Object.keys(old.pstat).every(k => st.pstat[k]), 'v0.6 の復習状態がすべて残る');
    ok(st.practice.fields.join() === old.practice.fields.join(), '選んでいた分野が残る');
    ok(st.log.length === old.log.length + 1, '学習記録が続きに足される');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 4. 一部の data/ だけ古い（P1 の本文ファイルの版が違う）
  {
    const page = await newPage({ route: (p) => p.route('**/' + P1_FILE, async (r) => {
      const res = await r.fetch(); const d = await res.json(); d._meta = { dataVersion: 'old000000000' };
      await r.fulfill({ response: res, body: JSON.stringify(d) });
    }) });
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate(`__lemma.open(['${P1}'])`); await page.waitForTimeout(800);
    const b = page.locator('.banner');
    ok(await b.count() === 1 && (await b.innerText()).includes(P1_FILE), `古い本文ファイル（${P1_FILE}）を読むと警告が出る`);
    ok(await page.locator('#inputs input').count() > 0, '警告が出ても問題は解ける');
  }
  // 5. 自己採点の前に解答・解説が出る／設定に「問題データ」が無い
  //    ぶつりばの問題はすべて入力用の答えを持つので、解答の形式を「自己採点」にして確かめる
  {
    const page = await newPage({ state: { settings: { answer: 'self' } } });
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate(`__lemma.open(['${P1}'])`); await page.waitForTimeout(800);
    ok(await page.locator('#inputs').count() === 0 && (await page.locator('.chip').allInnerTexts()).includes('自己採点'), '自己採点の形式では入力欄なし・「自己採点」のチップ');
    await page.locator('#conf button').nth(1).click();
    await page.click('#reveal'); await page.waitForTimeout(400);
    const order = await page.evaluate(() => { const a = document.querySelector('#solbox'), b = document.querySelector('#self'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    ok(order, '自己採点の問題で、解答・解説が「どうだった？」より前に出る');
    await page.locator('#self button').first().click(); await page.waitForTimeout(300);
    ok(await page.locator('#solbox').count() === 1, '採点後も解答・解説は1つだけ');
    await page.goto(U + '#settings'); await page.waitForTimeout(500);
    ok(!(await page.locator('#view').innerText()).includes('問題データ'), '設定に「問題データ」の項目が無い');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 5b. 今日の学習（v0.16）：今日の演習・中断と再開・自信なしの正解は早めに復習・類題・検索の絞り込み
  {
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    ok((await page.locator('h1').innerText()).includes('今日の学習') && await page.locator('#todaygo').count() === 1, '今日の画面に「今日の演習を始める」');
    ok(await page.locator('#resume').count() === 0, '中断した演習がなければ「前回の続き」は出ない');
    ok(await page.locator('.first-run #firstgo').count() === 1, '初めての利用では「まず8問解いてみる」');
    await page.click('#todaygo'); await page.waitForTimeout(1500);
    ok(await page.locator('#conf button').count() === 3, '今日の演習が始まる');
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')).steps[0].pid);
    // 1問目：自己採点で「自信なし」→ 正解
    await page.click('#quit'); await page.waitForTimeout(500);
    await page.goto(U + '#settings'); await page.waitForTimeout(800);
    await page.click('#amode [data-m="self"]'); await page.waitForTimeout(300);
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    ok(await page.locator('#resume').count() === 1, 'まだ答えていなくても、始めた演習は「前回の続き」に出る');
    await page.click('#resume'); await page.waitForTimeout(1500);
    const cur = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')));
    ok(cur.i === 0 && cur.steps[0].pid === first, '再開すると1問目から');
    await page.locator('#conf button').nth(0).click();
    await page.click('#reveal'); await page.waitForTimeout(400);
    await page.locator('#self button').first().click(); await page.waitForTimeout(400);
    const g = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.at(-1));
    ok(g.c === 'low' && g.ok && g.g === 2, `自信なしで正解 → 早めに復習（grade ${g.g}）`);
    ok((await page.locator('.conf-note').innerText()).includes('早めに復習'), '自信なしで正解したときの一言');
    const nSteps = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')).steps.length);
    // 類題：同じ分野・難易度の差1以内・共通のタグがある問題（catalog.js の similarTo。解法カードが無いのでタグだけ）。
    // 今日の演習の1問目は毎回変わるので、類題の候補が無い問題なら、ボタンが出ないことを確かめて「次へ」で進む
    const steps0 = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')).steps.map(s => s.pid));
    const e0 = INDEX.problems.find(p => p.id === first);
    const hasSim = INDEX.problems.some(p => p.f === e0.f && !steps0.includes(p.id) && Math.abs(p.lv - e0.lv) <= 1 && (p.tg || []).some(t => (e0.tg || []).includes(t)));
    if (hasSim) {
      ok(await page.locator('#similar').count() === 1, `類題のボタンが出る（${first}）`);
      await page.click('#similar'); await page.waitForTimeout(1200);
      const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')));
      ok(s2.steps.length === nSteps + 1 && s2.i === 1, '類題を1問追加すると次の問題に入る');
    } else {
      ok(await page.locator('#similar').count() === 0, `類題の候補が無い問題（${first}）では類題のボタンを出さない`);
      await page.click('#next'); await page.waitForTimeout(1200);
    }
    // 中断して再開すると2問目（類題）から
    await page.click('#quit'); await page.waitForTimeout(800);
    ok((await page.locator('#resume').innerText()).includes('2問目から'), '中断すると「前回の続き」が2問目から');
    await page.click('#resume'); await page.waitForTimeout(1500);
    ok(await page.locator('#conf button').count() === 3, '前回の続きから再開できる');
    // 確実なのに不正解 → 注意
    await page.locator('#conf button').nth(2).click();
    await page.click('#reveal'); await page.waitForTimeout(400);
    await page.locator('#self button').last().click(); await page.waitForTimeout(400);
    ok((await page.locator('.conf-note.warn').count()) === 1, '確実なのに不正解のときは思い込みの確認を促す');
    // 検索の絞り込み：間違えた問題
    await page.click('#quit'); await page.waitForTimeout(600);
    await page.goto(U + '#search=' + encodeURIComponent('a')); await page.waitForTimeout(1500);
    await page.selectOption('#sfilter', 'wrong'); await page.waitForTimeout(1200);
    const wrongIds = await page.$$eval('.res-row', els => els.map(x => x.dataset.pid));
    const wrongAll = await page.evaluate(() => { const m = new Map(); for (const l of JSON.parse(localStorage.getItem('lemma-physics.v1')).log) m.set(l.p, l.g); return [...m].filter(([, g]) => g < 3).map(([p]) => p); });
    ok(wrongAll.length >= 1 && wrongIds.every(id => wrongAll.includes(id)), `検索で「間違えた」に絞れる（${wrongIds.length}件）`);
    await page.selectOption('#sfilter', 'all'); await page.waitForTimeout(800);
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 5c. 解法カード（v0.17）：一覧・カード・カードから演習・解説から解法へ・検索で解法が出る・定着度の解法ごとの習熟
  //     ぶつりばの解法カードは今は 0 枚。カードが無いときは「無いときの正しい振る舞い」を確かめ、
  //     カードが入ったら（data/techniques.json の techniques が空でなくなったら）元の検査が働く
  if (TECHS.length) {
    const T = TECHS.slice().sort((a, b) => (b.main || []).length - (a.main || []).length)[0];   // 主な問題がいちばん多いカード
    const TN = T.name.replace(/\$[^$]*\$/g, '').trim().slice(0, 4) || T.name;                   // 名前の一部（数式は除く）
    const page = await newPage();
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.click('#techlink'); await page.waitForTimeout(1500);
    ok(await page.locator('.tech-row').count() === TECHS.length, `解法の一覧（${await page.locator('.tech-row').count()}枚）`);
    await page.fill('#tq', TN); await page.click('#tform button'); await page.waitForTimeout(800);
    ok(await page.locator('.tech-row').count() >= 1 && (await page.locator('.tech-row').allInnerTexts()).some(t => t.includes(TN)), `解法を名前で探せる（${TN}）`);
    await page.goto(U + '#tech=' + T.id); await page.waitForTimeout(1500);
    ok((await page.locator('h1').innerText()).includes(TN) && await page.locator('.tech-dl dt').count() >= 2, '解法カードに本質・使う場面・発想の起点');
    ok(await page.locator('details.tech-lv').count() >= 1, '難易度別の問題');
    if (await page.locator('.tech-dl a.chip.tech').count()) {
      await page.locator('.tech-dl a.chip.tech').first().click(); await page.waitForTimeout(800);
      ok(page.url().includes('#tech=') && !page.url().endsWith('#tech=' + T.id), '関連する解法へ移れる');
    }
    await page.goto(U + '#settings'); await page.waitForTimeout(800);
    await page.click('#amode [data-m="self"]'); await page.waitForTimeout(300);
    await page.goto(U + '#tech=' + T.id); await page.waitForTimeout(1500);
    await page.click('#tgo'); await page.waitForTimeout(1500);
    const pid = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')).steps[0].pid);
    ok((await page.locator('.why').innerText()).includes(TN), '解法カードからの演習で出題の理由を表示');
    ok(await page.locator('#conf button').count() === 3, `解法カードから演習が始まる（${pid}）`);
    await page.locator('#conf button').nth(1).click(); await page.click('#reveal'); await page.waitForTimeout(600);
    const chips = await page.locator('.tech-chips a').allInnerTexts();
    ok(chips.some(t => t.includes(TN)), `解説に「この問題の解法」（${chips}）`);
    await page.locator('#self button').last().click(); await page.waitForTimeout(400);
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.at(-1).k === 't'), '解法カードから解いた記録に k:t');
    await page.click('#quit'); await page.waitForTimeout(500);
    await page.goto(U + '#tech=' + T.id); await page.waitForTimeout(1500);
    ok((await page.locator('.tech-page .panel .chip.st').innerText()).includes('学習中'), '1問解いた解法は「学習中」');
    ok((await page.locator('.tech-page .panel').innerText()).includes('1問を解いた') && await page.locator('#twrong').count() === 1, '解法カードに自分の結果と「間違えた問題を解き直す」');
    await page.goto(U + '#search=' + encodeURIComponent(TN)); await page.waitForTimeout(1500);
    ok(await page.locator('.tech-hits .tech-row').count() >= 1, '検索で解法カードが出る');
    const F = TECHS.find(t => (t.former || []).length);
    if (F) {
      await page.goto(U + '#tech=' + F.former[0]); await page.waitForTimeout(1200);
      ok(page.url().endsWith('#tech=' + F.id), '旧 ID のリンクは新しいカードへ');
    }
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    const plan = await page.locator('#todaygo span').innerText();
    ok(/復習|解法|新しい問題/.test(plan), `今日の演習の説明に中身（${plan}）`);
    await page.click('#todaygo'); await page.waitForTimeout(1500);
    ok((await page.locator('.why').count()) === 1, '今日の演習で出題の理由を表示');
    // 解法の想起（任意）：主な解法がある問題なら解答後に聞き、答えを記録に残す
    let asked = false;
    for (let k = 0; k < 8 && !asked; k++) {
      await page.locator('#conf button').nth(1).click(); await page.click('#reveal'); await page.waitForTimeout(500);
      await page.locator('#self button').first().click(); await page.waitForTimeout(500);
      if (await page.locator('#recall').count()) {
        asked = true;
        await page.locator('#recall [data-r="3"]').click(); await page.waitForTimeout(300);
        ok(await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.at(-1).r === 3), '「解法が浮かばなかった」を記録に残す');
        ok((await page.locator('#recallmsg').innerText()).includes('着眼点'), '浮かばなかったときは着眼点へ案内');
      } else if (await page.locator('#next').count()) { await page.click('#next'); await page.waitForTimeout(1200); }
      else break;
    }
    ok(asked, '主な解法がある問題で、解答後に解法を思いついたかを聞く');
    await page.click('#quit'); await page.waitForTimeout(500);
    await page.goto(U + '#map'); await page.waitForTimeout(1500);
    ok((await page.locator('#view').innerText()).includes('解法の習熟') && await page.locator('.st-counts').count() === 1, '定着度に解法の習熟（状態ごとの数）');
    ok(await page.locator('.next-acts .next-act').count() >= 1 && (await page.locator('.next-acts').innerText()).includes('保留'), '記録が少ないうちは「次にやること」で判定を保留と伝える');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  } else {
    // 解法カードが無いとき：入口を出さない・一覧は準備中・カードの URL は「見つかりません」・
    // 推薦理由・解説・検索に解法が出ない・解法の想起を聞かない・定着度に状態ごとの数を出さない
    const page = await newPage({ state: { settings: { answer: 'self' } } });
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    ok(await page.locator('#techlink').count() === 0, 'カードが無い：ホームに「解法から選ぶ」を出さない');
    await page.goto(U + '#techs'); await page.waitForTimeout(1200);
    ok((await page.locator('#view').innerText()).includes('準備中') && await page.locator('.tech-row').count() === 0 && await page.locator('#tform').count() === 0, 'カードが無い：解法の一覧は「準備中」');
    await page.goto(U + '#tech=energy'); await page.waitForTimeout(1000);
    ok((await page.locator('#view').innerText()).includes('見つかりません'), 'カードが無い：#tech= のリンクは「見つかりません」');
    await page.goto(U + '#search=' + encodeURIComponent('エネルギー')); await page.waitForTimeout(1500);
    ok(await page.locator('.res-row').count() > 0 && await page.locator('.tech-hits').count() === 0, 'カードが無い：検索で問題は出て、解法カードは出ない');
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    const plan = await page.locator('#todaygo span').innerText();
    ok(/復習|新しい問題/.test(plan) && !/要復習の解法|新しい解法|違う文脈/.test(plan), `カードが無い：今日の演習の内訳に解法の分が無い（${plan}）`);
    await page.click('#todaygo'); await page.waitForTimeout(1500);
    ok((await page.locator('.why').count()) === 1, '今日の演習で出題の理由を表示');
    const whys = [];
    let recall = 0, techChips = 0, n = 0;
    for (let k = 0; k < 4; k++) {
      if (!(await page.locator('#conf button').count())) break;
      whys.push(await page.locator('.why').innerText().catch(() => ''));
      await page.locator('#conf button').nth(1).click(); await page.click('#reveal'); await page.waitForTimeout(500);
      techChips += await page.locator('.tech-chips').count();
      await page.locator('#self button').first().click(); await page.waitForTimeout(500);
      recall += await page.locator('#recall').count(); n++;
      if (await page.locator('#next').count()) { await page.click('#next'); await page.waitForTimeout(1200); } else break;
    }
    ok(n >= 2 && whys.every(w => w && !w.includes('解法')), `カードが無い：出題の理由に解法が出ない（${whys.join(' / ')}）`);
    ok(techChips === 0, 'カードが無い：解説に「この問題の解法」を出さない');
    ok(recall === 0, 'カードが無い：解法を思いついたかを聞かない');
    const logK = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.map(l => l.r));
    ok(logK.every(r => r === undefined), 'カードが無い：記録に想起（r）が付かない');
    await page.click('#quit'); await page.waitForTimeout(500);
    await page.goto(U + '#map'); await page.waitForTimeout(1500);
    ok(await page.locator('.st-counts').count() === 0, 'カードが無い：定着度に解法の状態ごとの数を出さない');
    ok(await page.locator('.next-acts .next-act').count() >= 1 && (await page.locator('.next-acts').innerText()).includes('保留'), '記録が少ないうちは「次にやること」で判定を保留と伝える');
    ok(!(await page.locator('.next-acts').innerText()).includes('解法カードを開く'), 'カードが無い：「次にやること」に解法カードを勧めない');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 6. 検索・問題セット・共有リンク・得意苦手の図
  {
    const old = JSON.parse(fs.readFileSync(path.join(root, FIXTURE), 'utf8'));
    const page = await newPage({ state: old });
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    ok(await page.locator('#sets .set-card').count() >= 3, '今日の画面に問題セット');
    await page.fill('#sq', 'ポテンシャル'); await page.press('#sq', 'Enter'); await page.waitForTimeout(1500);
    const n = await page.locator('.res-row').count();
    ok(n > 0 && (await page.locator('#sres').innerText()).includes('見つかりました'), `検索「ポテンシャル」で結果が出る（${n}件表示）`);
    await page.selectOption('#ssort', 'freq'); await page.waitForTimeout(1200);
    const fr = await page.$$eval('.res-row .chip.val', els => els.map(x => ({ '高': 3, '中': 2, '低': 1 })[x.textContent.slice(-1)]));
    ok(fr.length > 1 && fr.every((v, i) => !i || fr[i - 1] >= v), `頻出度順に並べ替えられる（${fr.join('')}）`);
    await page.selectOption('#ssort', 'hard'); await page.waitForTimeout(1200);
    const lv = await page.$$eval('.res-row .chip[class*="lv"]', els => els.map(x => +x.className.match(/lv(\d)/)[1]));
    ok(lv.length > 1 && lv.every((v, i) => !i || lv[i - 1] >= v), `難しい順に並べ替えられる（${lv.join('')}）`);
    await page.click('#sgo'); await page.waitForTimeout(1000);
    ok(await page.locator('#conf button').count() === 3, '検索結果から演習が始まる');
    const COL = JSON.parse(fs.readFileSync(path.join(root, 'data/collections.json'), 'utf8')).collections[0].id;
    await page.goto(U + '#set=' + COL); await page.waitForTimeout(1500);
    ok(page.url().endsWith('#today') && await page.locator('#conf button').count() === 3, '#set= のリンクで問題セットが始まる');
    await page.goto(U + `#ids=${P3},q01`); await page.waitForTimeout(1500);   // q01（受験数学版の内蔵問題）はぶつりばに無いので飛ばされる
    ok((await page.locator('.chip').allInnerTexts()).some(t => t.includes(fieldChip(P3))), '#ids= のリンクで指定の問題が出る');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.session.v1')).steps.map(s => s.pid).join()) === P3, '#ids= の無い問題ID（q01）は飛ばす');
    await page.goto(U + '#map'); await page.waitForTimeout(800);
    const fields = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8')).fields.length;
    ok(await page.locator('.strength svg.radar').count() === 1 && await page.locator('.strength .tile').count() === fields, `得意・苦手の図（レーダー＋${fields}分野のタイル）`);
    await page.locator('.strength .tile').first().click(); await page.waitForTimeout(1000);
    ok(await page.locator('#conf button').count() === 3, 'タイルをタップするとその分野の演習');
    ok(page.errors.length === 0, `ページのエラーなし ${page.errors}`);
  }
  // 7. Service Worker：データ用キャッシュが版で分かれ、版が変わると古い本文が捨てられる。オフラインでも開いた分野は解ける
  {
    const page = await newPage({ sw: true });
    await page.goto(U + '#today');
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    await page.reload(); await page.waitForTimeout(1200);
    await page.evaluate(`__lemma.open(['${P1}'])`); await page.waitForTimeout(1200);
    const v = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8')).dataVersion;
    const keys = await page.evaluate(async () => caches.keys());
    ok(keys.includes('lemma-data-' + v) && keys.some(k => k.startsWith('butsuriba-v')), `コード用とデータ用のキャッシュが分かれる ${keys}`);
    ok(await page.evaluate(async (f) => !!(await caches.match(f)), P1_FILE), '開いた分野の本文がキャッシュされる');
    await page.context().setOffline(true);
    await page.goto(U + '#today'); await page.waitForTimeout(1200);
    await page.evaluate(`__lemma.open(['${P1}'])`); await page.waitForTimeout(1200);
    ok(await page.locator('#inputs input').count() === P1_ANS.length, 'オフラインでも開いた分野の問題が解ける');
    await page.context().setOffline(false);
    fakeDataVersion = 'e2enewversion';
    await page.goto(U + '#today'); await page.waitForTimeout(1500);
    await page.evaluate(async () => fetch('data/index.json', { cache: 'no-cache' }));
    await page.waitForTimeout(500);
    const keys2 = await page.evaluate(async () => caches.keys());
    ok(keys2.includes('lemma-data-e2enewversion') && !keys2.includes('lemma-data-' + v), `データの版が変わると古いデータ用キャッシュを消す ${keys2}`);
    ok(!(await page.evaluate(async (f) => !!(await caches.match(f)), P1_FILE)), '古い版の本文は残らない');
    fakeDataVersion = null;
  }
  // 8. アカウントと同期：2台の端末でログインすると記録が合わさる（にせ Supabase）
  {
    const old = JSON.parse(fs.readFileSync(path.join(root, FIXTURE), 'utf8'));
    const login = async (page) => {
      await page.goto(U + '#settings'); await page.waitForTimeout(1500);
      await page.fill('#acct-email', 'me@example.com'); await page.click('#acct-send'); await page.waitForTimeout(500);
      await page.fill('#acct-code', '000000'); await page.click('#acct-verify'); await page.waitForTimeout(500);
      const wrong = await page.locator('#acct-err').innerText();
      await page.fill('#acct-code', '123456'); await page.click('#acct-verify'); await page.waitForTimeout(1500);
      // 端末とアカウントの両方に記録があるときは、合わせるかを聞かれる
      page.asked = await page.locator('.chooser').count() > 0;
      if (page.asked) { await page.click('.chooser [data-k="merge"]'); await page.waitForTimeout(1500); }
      return wrong;
    };
    const A = await newPage({ state: { ...old, log: old.log.slice(0, 25) } });
    const wrong = await login(A);
    ok(/コード/.test(wrong), '違うコードでは日本語のエラーが出る');
    ok((await A.locator('#acct').innerText()).includes('me@example.com') && (await A.locator('#acct-state').innerText()).includes('最後の同期'), '端末A：ログインして同期できる');
    const B = await newPage({ state: { ...old, log: old.log.slice(20) } });
    await login(B);
    ok(!A.asked && B.asked, 'ログイン時：アカウントにも端末にも記録があるときだけ、合わせるかを聞く');
    const nB = await B.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length);
    ok(nB === old.log.length, `端末B：両方の端末の記録が合わさる（${nB}件）`);
    await A.click('#acct-now'); await A.waitForTimeout(1500);
    const nA = await A.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length);
    ok(nA === old.log.length, '端末A：「今すぐ同期」で端末Bの記録も入る');
    // 解いたあとは自動で同期の予約が入る（ここでは画面を閉じたときの同期で確かめる）
    await A.evaluate(`__lemma.open(['${P3}'])`); await A.waitForTimeout(800);
    await A.locator('#conf button').nth(1).click();
    const inp = A.locator('#inputs input');
    for (let i = 0; i < P3_ANS.length; i++) await inp.nth(i).fill(P3_ANS[i]);
    await A.click('#judge'); await A.waitForTimeout(500);
    await A.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await A.waitForTimeout(1500);
    const srv = [...mock.rows.values()][0].state.log.map(l => l.p);
    ok(srv.includes(P3), 'アプリを閉じるときに、解いた結果がサーバーに送られる');
    await A.goto(U + '#settings'); await A.waitForTimeout(1200);
    await A.click('#acct-out'); await A.waitForTimeout(300);
    await A.click('.chooser [data-k="keep"]'); await A.waitForTimeout(1200);
    ok(await A.locator('#acct-email').count() === 1 && (await A.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length)) > 0, 'ログアウトしても端末の記録は残る');
    await B.goto(U + '#settings'); await B.waitForTimeout(1200);
    await B.click('#acct-del'); await B.waitForTimeout(1200);
    ok(mock.rows.size === 0 && mock.users.size === 0, '退会でサーバーの記録とアカウントが消える');
    const real = (es) => es.filter(e => !/status of 403/.test(e));   // わざと違うコードを入れたときの 403 は除く
    ok(real(A.errors).length === 0 && real(B.errors).length === 0, `ページのエラーなし ${A.errors} ${B.errors}`);
  }
  // 10. グラフ：平面（ベクトルを含む）・空間・複素数平面のモード、問題を解きながら開くシート
  {
    const G = await newPage();
    // 旧版の「ベクトル」モードの式は、平面の式へ移る
    await G.goto(U + '#today'); await G.waitForTimeout(600);
    await G.evaluate(() => { const s = JSON.parse(localStorage.getItem('lemma-physics.v1') || '{}'); s.graphMode = 'vector'; s.graphVExprs = [{ src: 'Q=(3,3)' }]; localStorage.setItem('lemma-physics.v1', JSON.stringify(s)); });
    await G.reload(); await G.goto(U + '#graph'); await G.waitForTimeout(1200);
    ok(await G.locator('.gmode button').count() === 3, 'グラフ：平面・空間・複素数平面の3モード');
    ok((await G.locator('.gmode button').allInnerTexts()).join() === '平面,空間,複素数平面', 'グラフ：モードの名前');
    ok(await G.locator('.gmode button.on').innerText() === '平面', '旧版のベクトルモードは平面で開く');
    const mig = await G.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')));
    ok(mig.graphExprs.some(e => e.src === 'Q=(3,3)') && !(mig.graphVExprs && mig.graphVExprs.length), '旧版のベクトルの式は平面の式へ移る');
    const ink = async () => G.evaluate(() => {   // グラフに色の付いた線・点があるか（背景と格子以外の画素）
      const c = document.querySelector('.gp canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) { const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; if (Math.max(r, g, b) - Math.min(r, g, b) > 80) n++; } return n;
    });
    // ぶつりばの例は物理用に差し替わっているので、名前で選ぶ（平面の例のあとに「ベクトル：…」が続く）
    // アプリの不具合：平面の例「プランク分布」「フェルミ分布」は、温度のスライダー名 t が媒介変数 t と重なって何も描かれない（エラーも出ない）。直るまで外す
    const BROKEN_2D = [];
    const preIndex = async (name) => (await G.locator('.gpre button').allInnerTexts()).indexOf(name);
    for (const m of ['complex', '2d']) {
      await G.click(`.gmode button[data-m="${m}"]`); await G.waitForTimeout(400);
      const names = await G.locator('.gpre button').allInnerTexts();
      for (let i = 0; i < names.length; i++) {
        if (m === '2d' && BROKEN_2D.includes(names[i])) continue;
        await G.click(`.gpre button[data-i="${i}"]`); await G.waitForTimeout(250);
        const errs = await G.$$eval('.expr-err', xs => xs.filter(x => !x.classList.contains('note')).map(x => x.textContent).filter(Boolean));
        ok(errs.length === 0, `グラフ（${m}）の例 ${i + 1}「${names[i]}」：式のエラーなし ${errs}`);
        ok(await ink() > 200, `グラフ（${m}）の例 ${i + 1}「${names[i]}」：描かれている`);
      }
    }
    await G.click('.gmode button[data-m="2d"]'); await G.waitForTimeout(300);
    await G.click(`.gpre button[data-i="${await preIndex('ベクトル：法線ベクトル')}"]`); await G.waitForTimeout(300);
    ok((await G.locator('.expr-err.note').allInnerTexts()).includes('= 4'), '平面のベクトル：内積 n·A の値を表示');
    const saved = await G.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).graphExprs.map(e => e.src));
    ok(saved.includes('n·(p-A)=0'), 'ベクトルの式も平面の式として保存される（同期の対象）');
    await G.click('.gmode button[data-m="2d"]'); await G.waitForTimeout(300);
    // 問題を解きながら：シートを開いて閉じても、入力中の答え・経過時間はそのまま
    await G.goto(U + '#today'); await G.waitForTimeout(800);
    await G.evaluate(`__lemma.open(['${P3}'])`); await G.waitForTimeout(1000);
    await G.locator('#conf button').nth(1).click();
    await G.locator('#inputs input').nth(0).fill(P3_ANS[0]);
    await G.click('[data-graph-sheet]'); await G.waitForTimeout(700);
    ok(await G.locator('.gsheet canvas').count() === 1, 'シート：問題の画面からグラフを開ける');
    await G.click('.gsheet .gmode button[data-m="complex"]'); await G.waitForTimeout(400);
    ok(await G.locator('.gsheet .gmode button.on').innerText() === '複素数平面', 'シート：モードを切り替えられる');
    await G.keyboard.press('Escape'); await G.waitForTimeout(300);
    ok(await G.locator('.gsheet').count() === 0, 'シート：Esc で閉じる');
    ok(await G.locator('#inputs input').nth(0).inputValue() === P3_ANS[0], 'シートを閉じても、入力中の答えが残る');
    await G.click('[data-graph-sheet]'); await G.waitForTimeout(500);
    await G.click('.gsheet-close'); await G.waitForTimeout(300);
    const inp = G.locator('#inputs input');
    await inp.nth(1).fill(P3_ANS[1]); await inp.nth(2).fill(P3_ANS[2]);
    await G.click('#judge'); await G.waitForTimeout(500);
    ok(await G.locator('#inputs .is-ok').count() >= 1, 'シートを使ったあとも、そのまま採点できる');
    // 空間ベクトル（空間のモードの「ベクトル：…」の例）
    await G.goto(U + '#graph'); await G.waitForTimeout(1000);
    await G.click('.gmode button[data-m="3d"]'); await G.waitForTimeout(400);
    const vec3 = (await G.locator('.gpre button').allInnerTexts()).map((n, i) => [n, i]).filter(([n]) => n.startsWith('ベクトル：')).map(([, i]) => i);
    ok(vec3.length === 4, `空間ベクトルの例が4つ（${vec3}）`);
    for (const i of vec3) {
      await G.click(`.gpre button[data-i="${i}"]`); await G.waitForTimeout(500);
      const errs = await G.$$eval('.expr-err', xs => xs.filter(x => !x.classList.contains('note')).map(x => x.textContent).filter(Boolean));
      ok(errs.length === 0, `空間ベクトルの例 ${i + 1}：式のエラーなし ${errs}`);
      ok(await ink() > 200, `空間ベクトルの例 ${i + 1}：描かれている`);
    }
    ok((await G.locator('.expr-err.note').allInnerTexts()).some(t => /^= 4\.89/.test(t)), '空間ベクトル：|a×b| の値を表示');
    await G.click('.gmode button[data-m="2d"]'); await G.waitForTimeout(300);
    // 問題の図：ぶつりばでは自動の図を作らない（content/figures.json は空）。図のある問題が無いときは、
    // 問題の画面に「問題の図」のボタンが出ないことを確かめる。図が入ったら元の検査（開く・直しても自分のグラフは変わらない・答えになる図は鍵）が働く
    const figPre = FIG_IDS.find(x => !x.fg.a), figAfter = FIG_IDS.find(x => x.fg.a);
    if (!FIG_IDS.length) {
      for (const id of [P1, P3]) {
        await G.goto(U + '#today'); await G.reload(); await G.waitForTimeout(1000);
        await G.evaluate(`__lemma.open(['${id}'])`); await G.waitForTimeout(1000);
        ok(await G.locator('[data-fig-sheet]').count() === 0 && await G.locator('[data-graph-sheet]').count() === 1, `問題の図が無い問題（${id}）：「問題の図」は出ず「グラフ」だけ`);
      }
    }
    if (figPre) {
      await G.goto(U + '#today'); await G.reload(); await G.waitForTimeout(1000);
      await G.evaluate(`__lemma.open(['${figPre.id}'])`); await G.waitForTimeout(1000);
      await G.click('[data-fig-sheet]'); await G.waitForTimeout(700);
      const figExprs = await G.$$eval('.gsheet .expr input', xs => xs.map(x => x.value));
      ok(figExprs.length === figPre.fg.e.length, `問題の図：問題文の式（${figPre.id}：${figExprs}）`);
      ok(await G.locator('.gsheet .gmode').count() === 0 && await G.locator('.gsheet .fig-note').count() === 1, '問題の図：取り出した旨を表示（モード切替なし）');
      const before = await G.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lemma-physics.v1')).graphExprs));
      await G.locator('.gsheet .expr input').first().fill('x^2+y^2=9'); await G.waitForTimeout(200);
      ok(await G.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lemma-physics.v1')).graphExprs)) === before, '問題の図：直しても自分のグラフは変わらない');
      await G.click('.gsheet .gcopy'); await G.waitForTimeout(200);
      ok((await G.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).graphExprs.map(e => e.src))).includes('x^2+y^2=9'), '問題の図：「グラフに写す」で自分のグラフへ');
      await G.click('.gsheet-close'); await G.waitForTimeout(300);
    }
    if (figAfter) {   // 図そのものが答えになる問題は、答え合わせのあと
      await G.goto(U + '#today'); await G.reload(); await G.waitForTimeout(1000);
      await G.evaluate(`__lemma.open(['${figAfter.id}'])`); await G.waitForTimeout(1000);
      ok(await G.locator('[data-fig-sheet].locked').count() === 1, '答えになる図：最初は鍵がかかっている');
      await G.click('[data-fig-sheet]'); await G.waitForTimeout(300);
      ok(await G.locator('.gsheet').count() === 0, '答えになる図：答え合わせの前は開かない');
      await G.locator('#conf button').nth(1).click();
      await G.click('#reveal'); await G.waitForTimeout(500);
      await G.click('[data-fig-sheet]'); await G.waitForTimeout(600);
      ok(await G.locator('.gsheet canvas').count() === 1, '答えになる図：答え合わせのあとは開ける');
      await G.click('.gsheet-close'); await G.waitForTimeout(200);
    }
    ok(G.errors.length === 0, `ページのエラーなし ${G.errors}`);
    await G.evaluate(() => { const s = JSON.parse(localStorage.getItem('lemma-physics.v1')); s.graphMode = '2d'; localStorage.setItem('lemma-physics.v1', JSON.stringify(s)); });
  }
  // 9. ブックマーク・記録の消去（ログイン中も効く）・バックアップの読み込み・ログイン時に端末の記録を使わない
  {
    mock.users.clear(); mock.rows.clear();
    const old = JSON.parse(fs.readFileSync(path.join(root, FIXTURE), 'utf8'));
    const P = await newPage();
    await P.goto(U + '#today'); await P.waitForTimeout(1500);
    await P.evaluate("__lemma.open(['PM-08-001'])"); await P.waitForTimeout(1000);
    await P.click('[data-bm="PM-08-001"]'); await P.waitForTimeout(200);
    ok(await P.locator('[data-bm="PM-08-001"].on').count() === 1, 'ブックマーク：問題画面で付けられる');
    await P.goto(U + '#today'); await P.reload(); await P.waitForTimeout(1500);   // 解いている途中のセットを閉じる
    ok((await P.locator('#bmset').innerText()).includes('1問'), 'ブックマーク：ホームに「ブックマークした問題 1問」');
    await P.click('#bmset'); await P.waitForTimeout(1000);
    ok(await P.locator('[data-bm="PM-08-001"]').count() === 1, 'ブックマーク：そこから出題できる');
    await P.click('[data-bm="PM-08-001"]'); await P.waitForTimeout(200);
    const bm = await P.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).bookmarks['PM-08-001']);
    ok(bm && bm.on === false && bm.t > 0, 'ブックマーク：外すと on:false の印が残る（同期でよみがえらない）');
    // バックアップの読み込み：形の違うファイルは断る・置き換えでファイルの記録になる
    await P.goto(U + '#settings'); await P.waitForTimeout(1000);
    await P.setInputFiles('#imp', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await P.waitForTimeout(400);
    ok((await P.locator('.toast').innerText()).includes('ぶつりばの学習記録のファイルではありません'), '読み込み：別のファイルは断る');
    await P.setInputFiles('#imp', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
    await P.waitForTimeout(400);
    const askedImp = await P.locator('.chooser [data-k="replace"]').count();
    if (askedImp) await P.click('.chooser [data-k="replace"]');
    await P.waitForTimeout(800);
    ok((await P.locator('.chooser').innerText()).includes('読み込みました'), '読み込み：結果（件数・点検）を表示する');
    await P.click('.chooser [data-k="ok"]'); await P.waitForTimeout(400);
    const st = await P.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')));
    ok(st.log.length === old.log.length && st.resetAt > 0, `読み込み：置き換えるとファイルの記録になり、消した印が付く（${st.log.length}件）`);
    const snaps = await P.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.snap.v1') || '[]'));
    ok(snaps.length === 1 && /置き換える前/.test(snaps[0].reason), '読み込み：置き換える前の記録を、端末に控えとして残す');
    // v0.23：書き出し（形式・版・確認用の値つき）→ 読み込み（合わせる）で件数が変わらない
    await P.goto(U + '#settings'); await P.waitForTimeout(800);
    const [exp] = await Promise.all([P.waitForEvent('download'), P.click('#exp')]);
    const bk = JSON.parse(fs.readFileSync(await exp.path(), 'utf8'));
    ok(bk.format === 'butsuriba-backup' && bk.version === 1 && bk.schema === 4 && bk.app && /^fnv1a32:/.test(bk.hash) && bk.state.log.length === old.log.length, '書き出し：形式・版・作成時刻・確認用の値つきのバックアップ');
    const tampered = JSON.parse(JSON.stringify(bk)); tampered.state.log.pop();
    await P.setInputFiles('#imp', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
    await P.waitForTimeout(400);
    ok((await P.locator('.toast').innerText()).includes('壊れているか'), '読み込み：中身が欠けたバックアップは断る');
    await P.setInputFiles('#imp', { name: 'b2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
    await P.waitForTimeout(400);
    await P.click('.chooser [data-k="merge"]'); await P.waitForTimeout(600);
    await P.click('.chooser [data-k="ok"]'); await P.waitForTimeout(400);
    ok((await P.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length)) === old.log.length, '読み込み：同じバックアップを合わせても記録は重複しない');
    // 控えの時点に戻す（設定の「自動の控え」）
    await P.goto(U + '#settings'); await P.waitForTimeout(800);
    ok(await P.locator('.snap-back').count() >= 1 && (await P.locator('.integrity summary').innerText()).includes('記録の点検'), '設定：記録の点検と自動の控えが見える');
    // ログインして同期 → 「記録をすべて消す」でアカウントの記録も消える
    const login = async (page, email) => {
      await page.goto(U + '#settings'); await page.waitForTimeout(1200);
      await page.fill('#acct-email', email); await page.click('#acct-send'); await page.waitForTimeout(400);
      await page.fill('#acct-code', '123456'); await page.click('#acct-verify'); await page.waitForTimeout(1500);
    };
    await login(P, 'reset@example.com');
    const srvN = () => { const r = [...mock.rows.values()][0]; return r ? r.state.log.length : -1; };
    ok(srvN() === old.log.length, `同期：アカウントに記録が上がる（${srvN()}件）`);
    const Q = await newPage({ state: { ...old, log: old.log.slice(0, 10) } });
    await login(Q, 'reset@example.com');
    if (await Q.locator('.chooser').count()) { await Q.click('.chooser [data-k="merge"]'); await Q.waitForTimeout(1500); }
    await P.goto(U + '#settings'); await P.waitForTimeout(1000);
    await P.click('#reset'); await P.waitForTimeout(300);
    ok(await P.locator('.chooser [data-k="all"]').count() === 1 && await P.locator('.chooser [data-k="device"]').count() === 1, '消去：ログイン中は「アカウントも」「この端末だけ」を選べる');
    await P.click('.chooser [data-k="all"]'); await P.waitForTimeout(1500);
    ok(srvN() === 0, `消去：アカウントの記録も消える（${srvN()}件）`);
    await Q.goto(U + '#settings'); await Q.waitForTimeout(800);
    await Q.click('#acct-now'); await Q.waitForTimeout(1500);
    const nQ = await Q.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length);
    ok(nQ === 0 && srvN() === 0, `消去：ほかの端末の古い記録も、同期で消える（端末 ${nQ}件・サーバー ${srvN()}件）`);
    // ログイン時に「アカウントの記録だけを使う」：端末の記録は書き出してから消える
    await P.evaluate("__lemma.open(['PM-08-001'])"); await P.waitForTimeout(800);
    await P.goto(U + '#settings'); await P.waitForTimeout(800);
    await P.click('#acct-now'); await P.waitForTimeout(1500);
    const R = await newPage({ state: { ...old, log: old.log.slice(0, 5) } });
    await R.goto(U + '#settings'); await R.waitForTimeout(1200);
    await R.fill('#acct-email', 'reset@example.com'); await R.click('#acct-send'); await R.waitForTimeout(400);
    // 先にサーバーへ1件入れておく（P の端末の解答）
    const r0 = [...mock.rows.values()][0];
    r0.state.log = [{ p: 'PM-08-001', t: Date.now(), g: 3 }]; r0.rev += 1;
    await R.fill('#acct-code', '123456'); await R.click('#acct-verify'); await R.waitForTimeout(1200);
    const [dl] = await Promise.all([R.waitForEvent('download', { timeout: 5000 }).catch(() => null), R.click('.chooser [data-k="remote"]')]);
    await R.waitForTimeout(1500);
    const nR = await R.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.map(l => l.p));
    ok(dl && JSON.stringify(nR) === '["PM-08-001"]', `ログイン時「アカウントの記録だけ」：端末の記録を書き出してから、アカウントの記録になる（${nR}）`);
    // ログアウトで端末の記録も消す
    await R.goto(U + '#settings'); await R.waitForTimeout(800);
    await R.click('#acct-out'); await R.waitForTimeout(300);
    await R.click('.chooser [data-k="wipe"]'); await R.waitForTimeout(1500);
    const nR2 = await R.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length);
    ok(nR2 === 0 && await R.locator('#acct-email').count() === 1, 'ログアウト時に端末の記録も消せる');
    // v0.23：保存されていた記録が壊れていても、上書きせずに退避する
    const BR = await newPage({ raw: '{"log":[{"p":"PM-08-001","t":1700000000000,"g":3}], こわれた' });
    await BR.goto(U + '#today'); await BR.waitForTimeout(1200);
    ok((await BR.locator('.banner').innerText()).includes('読めませんでした'), '壊れた記録：起動時に知らせる');
    const brk = await BR.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lemma-physics.v1.broken.')).map(k => JSON.parse(localStorage.getItem(k)).raw));
    ok(brk.length === 1 && brk[0].includes('こわれた'), '壊れた記録：元の文字列を消さずに退避する');
    // 同じ端末の2つのタブで解いても、どちらの記録も残る
    const T1 = await newPage({ state: { settings: { size: 6, newPerDay: 3, answer: 'self' } } });
    await T1.goto(U + '#today'); await T1.waitForTimeout(1000);
    const T2 = await T1.context().newPage(); T2.errors = [];
    await T2.goto(U + '#today'); await T2.waitForTimeout(1000);
    const solve = async (pg, pid) => {
      await pg.evaluate(`__lemma.open(['${pid}'])`); await pg.waitForTimeout(800);
      await pg.locator('#conf button').nth(1).click(); await pg.click('#reveal'); await pg.waitForTimeout(400);
      await pg.locator('#self button').first().click(); await pg.waitForTimeout(300);
    };
    await solve(T1, 'PM-08-002');
    const t1n = await T1.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.length);
    await solve(T2, 'PM-08-003');
    const both = await T2.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.map(l => l.p));
    ok(t1n >= 1 && both.includes('PM-08-002') && both.includes('PM-08-003'), `2つのタブ：あとから保存したタブが、先のタブの記録を消さない（${both}）`);
    // v0.24：新しい版（schema 99）の記録は、古いアプリでは保存しない（解いても上書きされず、再読み込みしても元のまま）
    const newerRaw = JSON.stringify({ ...old, schema: 99, settings: { ...old.settings, answer: 'self' }, future: { x: 1 } });
    const NW = await newPage({ raw: newerRaw });
    await NW.goto(U + '#today'); await NW.waitForTimeout(1200);
    ok((await NW.locator('.banner').innerText()).includes('保存も同期もしません'), '新しい schema：起動時に保存しないことを知らせる');
    await NW.evaluate("__lemma.open(['PM-08-002'])"); await NW.waitForTimeout(800);
    await NW.locator('#conf button').nth(1).click(); await NW.click('#reveal'); await NW.waitForTimeout(400);
    await NW.locator('#self button').first().click(); await NW.waitForTimeout(400);
    ok(await NW.evaluate(() => localStorage.getItem('lemma-physics.v1')) === newerRaw, '新しい schema：解いても保存された記録は書き換わらない');
    await NW.reload(); await NW.waitForTimeout(1200);
    ok(await NW.evaluate(() => localStorage.getItem('lemma-physics.v1')) === newerRaw, '新しい schema：再読み込みしても元の内容のまま');
    // 起動時に保存先を読めなかった（一時的な障害）：空の記録で上書きせず、読めるようになったら合わせて保存する
    const RF = await newPage({ state: { ...old, settings: { ...old.settings, answer: 'self' } } });
    await RF.context().addInitScript(() => {
      if (sessionStorage.getItem('rf')) return; sessionStorage.setItem('rf', '1');
      const orig = Storage.prototype.getItem; let n = 0;
      Storage.prototype.getItem = function (k) { if (k === 'lemma-physics.v1' && n++ === 0) throw new Error('SecurityError'); return orig.call(this, k); };
    });
    await RF.goto(U + '#today'); await RF.waitForTimeout(1200);
    ok((await RF.locator('.banner').innerText()).includes('読めませんでした'), '保存先を読めない：起動時に知らせる');
    await RF.evaluate("__lemma.open(['PM-08-002'])"); await RF.waitForTimeout(800);
    // 起動時に記録（設定の「自己採点」を含む）を読めていないので記述式で出る（ぶつりばの問題はすべて入力欄がある）。正しい答えを入れて判定する
    await RF.locator('#conf button').nth(1).click();
    if (await RF.locator('#reveal').count()) { await RF.click('#reveal'); await RF.waitForTimeout(400); await RF.locator('#self button').first().click(); }
    else { for (let i = 0; i < P3_ANS.length; i++) await RF.locator('#inputs input').nth(i).fill(P3_ANS[i]); await RF.click('#judge'); }
    await RF.waitForTimeout(400);
    const rfLog = await RF.evaluate(() => JSON.parse(localStorage.getItem('lemma-physics.v1')).log.map(l => l.p));
    ok(rfLog.length === old.log.length + 1 && rfLog.includes('PM-08-002'), `保存先が復旧したら、元の記録（${old.log.length}件）と合わせて保存する（${rfLog.length}件）`);
    const errs = [...P.errors, ...Q.errors, ...R.errors, ...BR.errors, ...T1.errors, ...T2.errors, ...NW.errors, ...RF.errors].filter(e => !/status of 40[13]/.test(e));
    ok(errs.length === 0, `ページのエラーなし ${errs}`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`e2e: ${pass} 件 OK${fail ? `、${fail} 件失敗` : ''}`);
process.exitCode = fail ? 1 : 0;
