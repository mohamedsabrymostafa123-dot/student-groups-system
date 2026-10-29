// اختبار: node test-grouping.js
const assert = require('assert');
const { chooseGroup, summarizeGroups, GROUP_SIZE } = require('./grouping');

const mk = (code, gender) => ({ collegeCode: String(code), fullName: 'S' + code, gender });

// تسجيل طالب (يحاكي السيرفر)
function register(list, s) {
  s.group = chooseGroup(list, s, { maxOpen: 3 });
  list.push(s);
  return s.group;
}

// 1) توازن مثالي بالتناوب: مجموعتان مكتملتان 5/5
let list = [];
for (let i = 1; i <= 20; i++) register(list, mk(i, i % 2 ? 'male' : 'female'));
let g = summarizeGroups(list);
assert.strictEqual(g.length, 2);
assert(g.every((x) => x.complete && x.balanced));

// 2) المشكلة المُبلَّغ عنها: المجموعة 1 اكتملت، وطالب جديد كوده الأصغر لا يدخلها
list = [];
for (let i = 1; i <= 15; i++) register(list, mk(i + 10, i % 2 ? 'male' : 'female')); // أكواد 11..25
const g1Before = summarizeGroups(list)[0].members.map((m) => m.collegeCode).join(',');
assert.strictEqual(summarizeGroups(list)[0].complete, true);
const newGroup = register(list, mk(1, 'male')); // كود أصغر من الكل
assert.notStrictEqual(newGroup, 1, 'المجموعة المكتملة لا تقبل أحداً');
assert.strictEqual(summarizeGroups(list)[0].members.map((m) => m.collegeCode).join(','), g1Before);
assert.strictEqual(summarizeGroups(list)[0].members.length, 10);

// 3) لا مجموعة تتجاوز 10 مهما كان التسجيل (عشوائي 300 طالب)
list = [];
const codes = Array.from({ length: 300 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
const seenFull = new Map(); // رقم المجموعة -> أعضاؤها عند الاكتمال
for (const c of codes) {
  register(list, mk(c, Math.random() > 0.45 ? 'male' : 'female'));
  assert(summarizeGroups(list).filter((x) => !x.complete).length <= 3, 'مجموعات مفتوحة أكثر من الحد');
  for (const grp of summarizeGroups(list)) {
    assert(grp.members.length <= GROUP_SIZE, 'مجموعة تجاوزت 10');
    const key = grp.members.map((m) => m.collegeCode).join(',');
    if (seenFull.has(grp.number)) assert.strictEqual(seenFull.get(grp.number), key, 'مجموعة مقفولة تغيّرت');
    else if (grp.complete) seenFull.set(grp.number, key);
  }
}
assert.strictEqual(new Set(list.map((s) => s.collegeCode)).size, 300);

// 4) عدم توازن شديد (30 شاب فقط) → لا تتراكم مجموعات ناقصة (الحد الأقصى 3 مفتوحة)
list = [];
for (let i = 1; i <= 30; i++) register(list, mk(i, 'male'));
g = summarizeGroups(list);
assert(g.filter((x) => !x.complete).length <= 3);
assert.strictEqual(g.reduce((n, x) => n + x.members.length, 0), 30);
assert(g.every((x) => x.members.length <= 10));

// 5) الأقرب في الكود: مجموعتان مفتوحتان
list = [
  ...[100, 101, 102].map((c) => ({ ...mk(c, 'male'), group: 2 })),
  ...[500, 501, 502].map((c) => ({ ...mk(c, 'male'), group: 3 })),
];
assert.strictEqual(chooseGroup(list, mk(504, 'male')), 3);
assert.strictEqual(chooseGroup(list, mk(98, 'male')), 2);

// 6) لو لا يوجد مكان مناسب لجنسه والمجموعات المفتوحة أقل من الحد → مجموعة جديدة
list = [1, 2, 3, 4, 5].map((c) => ({ ...mk(c, 'male'), group: 1 }));
assert.strictEqual(chooseGroup(list, mk(6, 'male'), { maxOpen: 3 }), 2);
assert.strictEqual(chooseGroup(list, mk(6, 'female'), { maxOpen: 3 }), 1);

console.log('✅ كل الاختبارات نجحت');
