// منطق توزيع الطلاب على المجموعات (توزيع تراكمي ثابت)
//
// - كل طالب يُسجَّل له رقم مجموعة (group) ويظل ثابتاً.
// - المجموعة التي تصل إلى 10 أفراد تُقفَل: لا يدخلها أحد بعد ذلك مهما كان كوده.
// - الطالب الجديد يذهب إلى مجموعة "مفتوحة" (أقل من 10):
//     1) يُفضَّل مجموعة فيها مكان لجنسه ضمن 5 شباب + 5 بنات.
//     2) لو أكثر من مجموعة مناسبة: الأقرب له في الكود.
//     3) لو لا توجد مجموعة متوازنة مناسبة: تُفتح مجموعة جديدة،
//        إلا إذا وصل عدد المجموعات المفتوحة إلى MAX_OPEN_GROUPS،
//        فيُكمَل في أقرب مجموعة مفتوحة (من الجنس المتاح) حتى لا تتراكم مجموعات ناقصة.

const GROUP_SIZE = 10;
const PER_GENDER = GROUP_SIZE / 2;
const MAX_OPEN_GROUPS = Number(process.env.MAX_OPEN_GROUPS) || 3;

function compareCodes(a, b) {
  return a.collegeCode.localeCompare(b.collegeCode, 'en', { numeric: true, sensitivity: 'base' });
}

const hasGroup = (s) => Number.isInteger(s.group) && s.group >= 1;

function groupMap(students) {
  const m = new Map();
  for (const s of students) {
    if (!hasGroup(s)) continue;
    if (!m.has(s.group)) m.set(s.group, []);
    m.get(s.group).push(s);
  }
  return m;
}

// الرقم داخل الكود (لحساب القرب). لو الكود بلا أرقام يرجع null
function codeNumber(code) {
  const d = String(code).replace(/\D/g, '');
  return d ? Number(d) : null;
}

function distance(members, cand) {
  const k = codeNumber(cand.collegeCode);
  if (k === null) return Infinity;
  let best = Infinity;
  for (const m of members) {
    const mk = codeNumber(m.collegeCode);
    if (mk !== null) best = Math.min(best, Math.abs(mk - k));
  }
  return best;
}

// يرجع رقم المجموعة المناسبة للطالب cand (لا يعدّل شيئاً)
function chooseGroup(students, cand, opts = {}) {
  const maxOpen = opts.maxOpen || MAX_OPEN_GROUPS;
  const map = groupMap(students);

  const open = [...map.entries()]
    .filter(([, members]) => members.length < GROUP_SIZE)
    .map(([number, members]) => ({ number, members }));

  const sameGender = (members) => members.filter((x) => x.gender === cand.gender).length;

  let pool = open.filter((o) => sameGender(o.members) < PER_GENDER);

  if (pool.length === 0 && open.length >= maxOpen) pool = open; // السماح بعدم التوازن

  if (pool.length === 0) {
    const maxN = map.size ? Math.max(...map.keys()) : 0;
    return maxN + 1; // مجموعة جديدة
  }

  pool.sort((a, b) => distance(a.members, cand) - distance(b.members, cand) || a.number - b.number);
  return pool[0].number;
}

function summarizeGroups(students) {
  return [...groupMap(students).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, members]) => {
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
    });
}

function findGroupOf(students, code) {
  return summarizeGroups(students).find((g) => g.members.some((m) => m.collegeCode === code)) || null;
}

module.exports = { GROUP_SIZE, PER_GENDER, compareCodes, hasGroup, chooseGroup, summarizeGroups, findGroupOf };
