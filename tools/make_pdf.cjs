// ぶつりば：全問題の「問題 → 解答」PDF（科目ごと、1ページに1問）
//   node tools/make_pdf.cjs data pdf [科目名…] のあと python3 tools/merge_pdf.py pdf
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DATA = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const ONLY = process.argv.slice(4);
const VENDOR = path.join(__dirname, "..", "vendor");
const katex = require(path.join(VENDOR, 'katex.min.js'));
fs.mkdirSync(OUT, { recursive: true });

const SUBJECTS = ['物理数学', '力学', '振動・波動', '解析力学', '連続体力学', '電磁気学', '特殊相対論', '熱力学', '統計力学', '量子力学', '実験学',
  '固体物理学', '生物物理学', '原子核物理学', '相対論的量子力学', '場の量子論', '素粒子物理学', '一般相対論', '宇宙物理学', '融合'];
const LEVELS = ['基礎', '標準', '演習', '院試', '院試難関'];
const VALUES = { 1: '低', 2: '中', 3: '高' };

const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const fieldInfo = Object.fromEntries(index.fields.map((f, i) => [f.key || f.k || f.id, { ...f, i }]));
const bodies = {};
for (const f of fs.readdirSync(DATA).filter((f) => f.startsWith('f-'))) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  for (const [k, v] of Object.entries(d)) if (!k.startsWith('_')) bodies[k] = v;
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function km(t, disp) {
  try { return katex.renderToString(unesc(t), { throwOnError: false, displayMode: disp, strict: false, output: 'html' }); }
  catch (e) { return `<code>${esc(t)}</code>`; }
}
// 表示数式 \[...\] と行内 $...$ を KaTeX の HTML に置き換える
function math(html) {
  if (!html) return '';
  let s = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => km(m, true));
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$') {
      let j = i + 1, depth = 0;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        else if (s[j] === '$' && depth === 0) break;
        j++;
      }
      if (j >= s.length) { out += s.slice(i); break; }
      out += km(s.slice(i + 1, j), false);
      i = j + 1;
    } else { out += s[i]; i++; }
  }
  return out;
}
// 「答え」は (1) (2) … を行に分けて見やすく
function answerHTML(a) {
  const t = math(a || '');
  return t.replace(/(　|\s)(\((\d{1,2})\))(?=\s|<|$)/g, '<br>$2');
}

const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Noto Serif CJK JP', 'Noto Sans CJK JP', serif; font-size: 10.5pt; line-height: 1.75; color: #1b1f2a; margin: 0; }
.katex { font-size: 1.06em; }
.katex-display { margin: .5em 0; overflow: visible; }
.cover { page-break-after: always; padding-top: 70mm; }
.cover .app { font-family: 'Noto Sans CJK JP', sans-serif; color: #16285a; font-size: 13pt; letter-spacing: .1em; }
.cover h1 { font-family: 'Noto Sans CJK JP', sans-serif; font-size: 30pt; margin: 6mm 0 2mm; color: #16285a; }
.cover .sub { font-size: 12pt; color: #555; }
.cover table { margin-top: 14mm; border-collapse: collapse; font-size: 10pt; }
.cover td { padding: 1.2mm 4mm; border-bottom: 1px solid #ddd; }
.cover td.n { text-align: right; color: #555; }
.cover .note { margin-top: 10mm; font-size: 9pt; color: #666; }
h2.field { font-family: 'Noto Sans CJK JP', sans-serif; page-break-before: always; font-size: 17pt; color: #16285a; border-bottom: 2px solid #16285a; padding-bottom: 2mm; margin: 0 0 4mm; }
h2.field + .prob { page-break-before: avoid; }
.prob { page-break-before: always; }
.meta { font-family: 'Noto Sans CJK JP', sans-serif; font-size: 8.5pt; color: #555; display: flex; flex-wrap: wrap; gap: 2mm 3mm; margin-bottom: 1.5mm; }
.meta span { border: 1px solid #c9cfdb; border-radius: 3mm; padding: 0 2.4mm; }
.meta .id { background: #16285a; color: #fff; border-color: #16285a; font-weight: 700; }
.meta .lv { background: #eef2fb; }
h3.theme { font-family: 'Noto Sans CJK JP', sans-serif; font-size: 12.5pt; margin: 0 0 3mm; color: #16285a; }
.box { border: 1.2px solid #16285a; border-radius: 2mm; padding: 3mm 4mm; }
.lab { font-family: 'Noto Sans CJK JP', sans-serif; font-weight: 700; font-size: 9.5pt; color: #fff; background: #16285a; display: inline-block; padding: .2mm 3mm; border-radius: 1.5mm; margin-bottom: 1.5mm; }
.lab.ans { background: #b4402a; }
.sol { margin-top: 6mm; border-top: 1.5px dashed #b4402a; padding-top: 3mm; }
.ansbox { line-height: 2.2; background: #fbf1ee; border-left: 3px solid #b4402a; padding: 2mm 4mm; margin: 1mm 0 3mm; }
.idea { background: #f1f4fa; border-left: 3px solid #16285a; padding: 2mm 4mm; margin-top: 3mm; font-size: 9.8pt; }
.idea b { font-family: 'Noto Sans CJK JP', sans-serif; color: #16285a; }
br.p { display: block; content: ''; margin-top: .55em; }
ol { margin: .4em 0; padding-left: 0; list-style: none; }
ol li { display: block; position: relative; padding-left: 8mm; margin: .25em 0; }
ol li .lb { position: absolute; left: 0; font-family: 'Noto Sans CJK JP', sans-serif; font-weight: 700; color: #16285a; }
ul { margin: .3em 0 .3em 1.2em; padding: 0; }
table { border-collapse: collapse; margin: .4em 0; }
td, th { border: 1px solid #bbb; padding: .5mm 2mm; }
.dm { overflow: visible; }
`;

function build(subject) {
  const fields = index.fields.filter((f) => f.subject === subject);
  const forder = (k) => fields.findIndex((f) => f.key === k);
  const probs = index.problems.filter((p) => forder(p.f) >= 0);
  if (!probs.length) return null;
  probs.sort((a, b) => forder(a.f) - forder(b.f) || a.lv - b.lv || a.id.localeCompare(b.id));
  const counts = fields.map((f) => [f.name, probs.filter((p) => p.f === f.key).length]).filter((x) => x[1]);
  const cover = `<section class="cover"><div class="app">ぶつりば · 大学物理</div><h1>${esc(subject)}</h1>
    <div class="sub">問題と解答（全 ${probs.length.toLocaleString()} 問）</div>
    <table>${counts.map(([n, c]) => `<tr><td>${esc(n)}</td><td class="n">${c}問</td></tr>`).join('')}</table>
    <div class="note">各ページに1問ずつ、問題・答え・解説の順に載せています（長い解説は次のページに続きます）。難易度は 基礎・標準・演習・院試・院試難関 の5段階。PDF のしおりから分野・問題に移動できます。</div></section>`;
  const chunks = [[cover]];
  const manifest = [];
  let cur = null, n = 0;
  for (const p of probs) {
    const f = fields[forder(p.f)];
    if (n >= CHUNK) { chunks.push([]); n = 0; }
    const part = chunks[chunks.length - 1];
    let first = '';
    if (p.f !== cur) { cur = p.f; first = `<h2 class="field">${esc(f.name)}</h2>`; }
    const b = bodies[p.id] || {};
    part.push(`${first}<section class="prob"${part.length === 0 && !first ? ' style="page-break-before:auto"' : ''}>
      <div class="meta"><span class="id">${p.id}</span><span>${esc(subject)}・${esc(f.name)}</span><span class="lv">${LEVELS[p.lv] || ''}</span><span>頻出度 ${VALUES[p.v || 2]}</span>${p.t ? `<span>目安 ${p.t}分</span>` : ''}</div>
      <h3 class="theme">${esc(p.th || '')}</h3>
      <div class="lab">問題</div>
      <div class="box">${math(b.q)}</div>
      <div class="sol">
        <div class="lab ans">答え</div>
        <div class="ansbox">${answerHTML(b.a)}</div>
        <div class="lab ans">解答・解説</div>
        <div>${math(b.s)}</div>
        ${b.k ? `<div class="idea"><b>核となるアイデア</b>　${math(b.k)}</div>` : ''}
      </div></section>`);
    manifest.push({ id: p.id, field: f.name, theme: p.th || '', lv: LEVELS[p.lv], chunk: chunks.length - 1 });
    n++;
  }
  const wrap = (body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ぶつりば ${esc(subject)} 問題と解答</title>
    <link rel="stylesheet" href="file://${VENDOR}/katex.min.css"><style>${CSS}</style></head><body>${body}</body></html>`;
  return { chunks: chunks.map((c) => wrap(c.join('\n'))), manifest, n: probs.length };
}

const CHUNK = 120;
(async () => {
  // 科目を指定しないときは、科目ごとに別のプロセスで作る（電磁気学など大きい科目でメモリが足りなくなるため）
  if (!ONLY.length) {
    const { execFileSync } = require('child_process');
    for (const s of SUBJECTS) execFileSync(process.execPath, ['--max-old-space-size=4096', __filename, DATA, OUT, s], { stdio: 'inherit' });
    return;
  }
  const browser = await chromium.launch();
  for (const [i, s] of SUBJECTS.entries()) {
    if (ONLY.length && !ONLY.includes(s)) continue;
    const r = build(s);
    if (!r) continue;
    const name = `${String(i + 1).padStart(2, '0')}_${s.replace(/・/g, '')}`;
    const dir = path.join(OUT, 'parts', name);
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    const files = [];
    for (const [k, html] of r.chunks.entries()) {
      const htmlPath = path.join(dir, `${String(k).padStart(3, '0')}.html`);
      fs.writeFileSync(htmlPath, html);
      const page = await browser.newPage();
      await page.goto('file://' + htmlPath, { waitUntil: 'load', timeout: 0 });
      await page.evaluate(() => document.fonts.ready);
      const pdf = htmlPath.replace(/\.html$/, '.pdf');
      await page.pdf({
        path: pdf, format: 'A4', printBackground: true,
        displayHeaderFooter: true, headerTemplate: '<div></div>',
        footerTemplate: `<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:'Noto Sans CJK JP'">ぶつりば　${s}</div>`,
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' }, timeout: 0,
      });
      await page.close();
      fs.unlinkSync(htmlPath);
      files.push(pdf);
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ subject: s, name, files, problems: r.manifest }));
    console.log(s, r.n, '問', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  await browser.close();
})();
