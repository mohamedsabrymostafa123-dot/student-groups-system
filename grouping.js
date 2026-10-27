// خوارزمية التوزيع الذكي للمجموعات (مع دعم النقل اليدوي)
//
// 1) الطلاب المنقولون يدوياً (manualGroup) يُثبَّتون في المجموعة المحددة.
// 2) باقي الطلاب يُرتَّبون تصاعدياً بكود الكلية ويُوزَّعون على المجموعات بالتتابع.
// 3) كل مجموعة = 10 أفراد. الهدف 5 شباب + 5 بنات من أقرب أكواد متجاورة
//    (المثبَّتون يُحسبون ضمن عدد جنسهم).
// 4) لو لم يتحقق التوازن داخل نافذة البحث (LOOKAHEAD)، تُكمَل المجموعة بأقرب الأكواد بالترتيب.
// 5) لو تبقّى أقل من اللازم → المجموعة الأخيرة "مفتوحة" ولا تُحذف.

const GROUP_SIZE = 10;
const PER_GENDER = GROUP_SIZE / 2;
const LOOKAHEAD = Number(process.env.LOOKAHEAD) || 30;

function compareCodes(a, b) {
  return a.collegeCode.localeCompare(b.collegeCode, 'en', { numeric: true, sensitivity: 'base' });
}

const isPinned = (s) => Number.isInteger(s.manualGroup) && s.manualGroup >= 1;

function buildGroups(students, options = {}) {
  const lookahead = options.lookahead || LOOKAHEAD;

  const pinned = students.filter(isPinned);
  let remaining = students.filter((s) => !isPinned(s)).sort(compareCodes);

  const pinnedBy = new Map();
  pinned.forEach((s) => {
    if (!pinnedBy.has(s.manualGroup)) pinnedBy.set(s.manualGroup, []);
    pinnedBy.get(s.manualGroup).push(s);
  });
  const maxPinned = pinned.length ? Math.max(...pinned.map((s) => s.manualGroup)) : 0;

  const groups = [];

  for (let n = 1; remaining.length > 0 || n <= maxPinned; n++) {
    const fixed = pinnedBy.get(n) || [];
    const need = GROUP_SIZE - fixed.length;
    let auto = [];

    if (need > 0 && remaining.length > 0) {
      if (remaining.length <= need) {
        auto = remaining;
        remaining = [];
      } else {
        const cap = {
          male: Math.max(0, PER_GENDER - fixed.filter((s) => s.gender === 'male').length),
          female: Math.max(0, PER_GENDER - fixed.filter((s) => s.gender === 'female').length),
        };
        const counts = { male: 0, female: 0 };
        const picked = new Set();
        const limit = Math.min(remaining.length, lookahead);

        // محاولة التوازن من أقرب نطاق
        for (let i = 0; i < limit && picked.size < need; i++) {
          const g = remaining[i].gender;
          if (counts[g] < cap[g]) {
            counts[g]++;
            picked.add(i);
          }
        }
        // الإكمال بالترتيب من أي جنس
        for (let i = 0; i < remaining.length && picked.size < need; i++) {
          if (!picked.has(i)) picked.add(i);
        }

        const rest = [];
        remaining.forEach((s, i) => (picked.has(i) ? auto : rest).push(s));
        remaining = rest;
      }
    }

    const members = [...fixed, ...auto];
    if (members.length === 0) continue; // مجموعة فارغة: نتخطاها
    groups.push(finalize(n, members));
  }

  return groups;
}

function finalize(number, members) {
  members.sort(compareCodes);
  const males = members.filter((m) => m.gender === 'male').length;
  const females = members.length - males;
  return {
    number,
    complete: members.length >= GROUP_SIZE,
    males,
    females,
    balanced: males === PER_GENDER && females === PER_GENDER,
    members,
  };
}

function findGroupOf(students, code) {
  return buildGroups(students).find((g) => g.members.some((m) => m.collegeCode === code)) || null;
}

module.exports = { buildGroups, findGroupOf, GROUP_SIZE };
