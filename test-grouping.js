// اختبار سريع للخوارزمية: node test-grouping.js
const { buildGroups } = require('./grouping');
const assert = require('assert');

const mk = (code, gender, extra = {}) => ({ collegeCode: String(code), fullName: 'S' + code, gender, ...extra });
const alt = (n) => Array.from({ length: n }, (_, i) => mk(i + 1, (i + 1) % 2 ? 'male' : 'female'));

// 1) توازن مثالي
let g = buildGroups(alt(20));
assert.strictEqual(g.length, 2);
assert(g.every((x) => x.complete && x.balanced));

// 2) كسور → مجموعة أخيرة مفتوحة
g = buildGroups(alt(23));
assert.strictEqual(g.length, 3);
assert.strictEqual(g[2].complete, false);
assert.strictEqual(g[2].members.length, 3);

// 3) عدم توازن
let s = [];
for (let i = 1; i <= 15; i++) s.push(mk(i, 'male'));
for (let i = 16; i <= 20; i++) s.push(mk(i, 'female'));
g = buildGroups(s);
assert(g.every((x) => x.members.length === 10));

// 4) ترتيب رقمي
g = buildGroups([mk(10, 'male'), mk(2, 'female'), mk(1, 'male')]);
assert.deepStrictEqual(g[0].members.map((m) => m.collegeCode), ['1', '2', '10']);

// 5) النقل اليدوي: نقل الطالب 1 (من مجموعة 1) إلى مجموعة 3
s = alt(30);
const before = buildGroups(s);
assert(before[0].members.some((m) => m.collegeCode === '1'));
s.find((x) => x.collegeCode === '1').manualGroup = 3;
g = buildGroups(s);
assert.strictEqual(g.length, 3);
assert(g.every((x) => x.members.length === 10), 'كل مجموعة يجب أن تبقى 10');
assert(g[2].members.some((m) => m.collegeCode === '1'), 'الطالب 1 يجب أن يكون في مجموعة 3');
assert(!g[0].members.some((m) => m.collegeCode === '1'));
const all = g.flatMap((x) => x.members.map((m) => m.collegeCode));
assert.strictEqual(new Set(all).size, 30);

// 6) إلغاء النقل يرجّع التوزيع الأصلي
delete s.find((x) => x.collegeCode === '1').manualGroup;
g = buildGroups(s);
assert.deepStrictEqual(
  g.map((x) => x.members.map((m) => m.collegeCode)),
  before.map((x) => x.members.map((m) => m.collegeCode))
);

// 7) نقل من مجموعة متأخرة لمتقدمة
s = alt(30);
s.find((x) => x.collegeCode === '30').manualGroup = 1;
g = buildGroups(s);
assert(g[0].members.some((m) => m.collegeCode === '30'));
assert(g.every((x) => x.members.length === 10));
assert.strictEqual(new Set(g.flatMap((x) => x.members.map((m) => m.collegeCode))).size, 30);

// 8) عشوائي: لا تكرار
s = [];
for (let i = 1; i <= 57; i++) s.push(mk(i, Math.random() > 0.4 ? 'male' : 'female'));
s[5].manualGroup = 4; s[40].manualGroup = 1;
g = buildGroups(s);
const ids = g.flatMap((x) => x.members.map((m) => m.collegeCode));
assert.strictEqual(ids.length, 57);
assert.strictEqual(new Set(ids).size, 57);

console.log('✅ كل اختبارات الخوارزمية (بما فيها النقل اليدوي) نجحت');
