// 教材データ：科目・単元・解法カード・問題
// 難易度の目安：2 = 標準 / 3 = 入試標準 / 4 = 数学探究
// 文章中の数式は $...$（KaTeX）。String.raw でバックスラッシュをそのまま書く。
// type: num（数値）/ expr（文字式・vars の範囲で乱数代入して判定。[lo, hi, 'int'] は整数のみ）
//       nums（数の組・順不同）/ choice（choices[0] が正解）/ sketch（概形を描いて自己評価）

const T = String.raw;
export const FILE_VERSION = '0.26.0';

export const SUBJECTS = [
  { id: 'I', name: '数学I' },
  { id: 'A', name: '数学A' },
  { id: 'II', name: '数学II' },
  { id: 'B', name: '数学B' },
  { id: 'III', name: '数学III' },
  { id: 'C', name: '数学C' },
];

export const UNITS = [
  { id: 'i-quad', subject: 'I', name: '2次関数' },
  { id: 'i-geo', subject: 'I', name: '図形と計量' },
  { id: 'i-data', subject: 'I', name: 'データの分析' },
  { id: 'a-prob', subject: 'A', name: '場合の数と確率' },
  { id: 'a-int', subject: 'A', name: '整数の性質' },
  { id: 'a-geo', subject: 'A', name: '図形の性質' },
  { id: 'ii-eq', subject: 'II', name: '式と証明・複素数と方程式' },
  { id: 'ii-coord', subject: 'II', name: '図形と方程式' },
  { id: 'ii-trig', subject: 'II', name: '三角関数' },
  { id: 'ii-exp', subject: 'II', name: '指数・対数' },
  { id: 'ii-calc', subject: 'II', name: '微分・積分' },
  { id: 'b-seq', subject: 'B', name: '数列' },
  { id: 'b-stat', subject: 'B', name: '統計的な推測' },
  { id: 'iii-lim', subject: 'III', name: '極限' },
  { id: 'iii-diff', subject: 'III', name: '微分法' },
  { id: 'iii-int', subject: 'III', name: '積分法' },
  { id: 'c-vec', subject: 'C', name: 'ベクトル' },
  { id: 'c-cplx', subject: 'C', name: '複素数平面' },
  { id: 'c-conic', subject: 'C', name: '2次曲線・極座標' },
];

export const LEVELS = { 2: '標準', 3: '入試標準', 4: '数学探究' };

// ぶつりばでは、受験数学版の内蔵問題（自動判定つきの61問）と、その解法カードは使わない。
// 問題はすべて問題管理表から（data/）。物理の解法カードは content/techniques.json に作る予定。
export const CARDS = [];
export const PROBLEMS = [];

export const cardById = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const problemById = Object.fromEntries(PROBLEMS.map(p => [p.id, p]));
export const unitById = Object.fromEntries(UNITS.map(u => [u.id, u]));
export const subjectById = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));
export function problemsFor(cardId) { return PROBLEMS.filter(p => p.cards.includes(cardId)); }
export function unitOf(p) { return cardById[p.cards[0]].unit; }
export function subjectOf(p) { return unitById[unitOf(p)].subject; }
