require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const db = require('./db');
const { buildGroups, findGroupOf, GROUP_SIZE } = require('./grouping');

const { MONGODB_URI, ADMIN_USER, ADMIN_PASSWORD } = process.env;
const DB_NAME = process.env.DB_NAME || 'student_groups';
const PORT = process.env.PORT || 3000;

if (!MONGODB_URI || MONGODB_URI.includes('<db_password>')) {
  console.error('❌ افتح ملف .env واستبدل <db_password> بباسورد قاعدة بيانات MongoDB.');
  process.exit(1);
}
if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error('❌ ADMIN_USER و ADMIN_PASSWORD لازم يكونوا موجودين في ملف .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'حدث خطأ في الخادم.' });
  });

// ================= التسجيل =================
app.post('/api/register', wrap(async (req, res) => {
  const { fullName, collegeCode, gender, phone, originalGroup } = req.body || {};

  if (!fullName || String(fullName).trim().length < 3)
    return res.status(400).json({ error: 'الاسم الكامل مطلوب (3 أحرف على الأقل).' });
  if (!collegeCode || !/^[A-Za-z0-9\-_]{1,20}$/.test(String(collegeCode).trim()))
    return res.status(400).json({ error: 'كود الكلية غير صالح (حروف/أرقام فقط حتى 20 خانة).' });
  if (!['male', 'female'].includes(gender))
    return res.status(400).json({ error: 'اختر الجنس (شاب / بنت).' });
  if (!phone || !/^\+?[0-9]{8,15}$/.test(String(phone).replace(/[\s\-]/g, '')))
    return res.status(400).json({ error: 'رقم الهاتف/الواتساب غير صالح.' });

  try {
    await db.addStudent({
      fullName, collegeCode, gender,
      phone: String(phone).replace(/[\s\-]/g, ''),
      originalGroup: originalGroup ? String(originalGroup).slice(0, 100) : '',
    });
    res.status(201).json({ message: 'تم التسجيل بنجاح ✅ يمكنك الآن البحث عن مجموعتك.' });
  } catch (e) {
    if (e.code === 'DUPLICATE_CODE')
      return res.status(409).json({ error: 'كود الكلية هذا مسجَّل بالفعل ولا يمكن تكراره.' });
    throw e;
  }
}));

// ================= البحث عن المجموعة =================
app.get('/api/group/:code', wrap(async (req, res) => {
  const code = db.normalizeCode(req.params.code);
  const student = await db.findByCode(code);
  if (!student) return res.status(404).json({ error: 'هذا الكود غير مسجَّل. سجّل بياناتك أولاً.' });

  const group = findGroupOf(await db.getStudents(), code);
  const links = await db.getLinks();

  res.json({
    me: { fullName: student.fullName, collegeCode: student.collegeCode },
    group: {
      number: group.number,
      complete: group.complete,
      size: group.members.length,
      whatsappLink: links[String(group.number)] || null,
      members: group.members.map((m) => ({ fullName: m.fullName, collegeCode: m.collegeCode, gender: m.gender })),
    },
  });
}));

// ================= المشرف: الدخول =================
const sessions = new Map(); // token -> وقت الانتهاء
const attempts = new Map(); // ip -> { count, start }
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

app.post('/api/admin/login', (req, res) => {
  const now = Date.now();
  const rec = attempts.get(req.ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  if (rec.count >= MAX_ATTEMPTS)
    return res.status(429).json({ error: 'محاولات كثيرة خاطئة. حاول بعد 15 دقيقة.' });

  const { username, password } = req.body || {};
  const userOk = safeEqual(String(username || '').trim().toLowerCase(), ADMIN_USER.toLowerCase());
  const passOk = safeEqual(password || '', ADMIN_PASSWORD);

  if (!(userOk && passOk)) {
    rec.count++;
    attempts.set(req.ip, rec);
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }

  attempts.delete(req.ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, now + SESSION_MS);
  res.json({ token });
});

function adminOnly(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  const exp = m && sessions.get(m[1]);
  if (!exp || exp < Date.now()) {
    if (m) sessions.delete(m[1]);
    return res.status(401).json({ error: 'انتهت الجلسة، سجّل الدخول من جديد.' });
  }
  req.token = m[1];
  next();
}

app.post('/api/admin/logout', adminOnly, (req, res) => {
  sessions.delete(req.token);
  res.json({ message: 'تم الخروج.' });
});

// ================= المشرف: المجموعات =================
app.get('/api/admin/groups', adminOnly, wrap(async (req, res) => {
  const students = await db.getStudents();
  const links = await db.getLinks();
  const groups = buildGroups(students).map((g) => ({
    number: g.number,
    complete: g.complete,
    males: g.males,
    females: g.females,
    whatsappLink: links[String(g.number)] || '',
    members: g.members.map((m) => ({
      fullName: m.fullName,
      collegeCode: m.collegeCode,
      gender: m.gender,
      phone: m.phone,
      originalGroup: m.originalGroup || '',
      pinned: Number.isInteger(m.manualGroup),
    })),
  }));
  res.json({ total: students.length, groups });
}));

app.post('/api/admin/link', adminOnly, wrap(async (req, res) => {
  const { group, link } = req.body || {};
  if (!Number.isInteger(group) || group < 1) return res.status(400).json({ error: 'رقم مجموعة غير صالح.' });
  if (link && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(link))
    return res.status(400).json({ error: 'الرابط يجب أن يبدأ بـ https://chat.whatsapp.com/' });
  await db.setLink(group, link || '');
  res.json({ message: 'تم حفظ الرابط.' });
}));

// نقل طالب من مجموعة لأخرى (group = رقم، أو null لإلغاء النقل)
app.post('/api/admin/move', adminOnly, wrap(async (req, res) => {
  const { code, group } = req.body || {};
  const student = await db.findByCode(code || '');
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود.' });

  if (group === null) {
    await db.setManualGroup(student.collegeCode, null);
    return res.json({ message: 'تم إلغاء النقل اليدوي، ورجع الطالب للتوزيع التلقائي.' });
  }
  if (!Number.isInteger(group) || group < 1) return res.status(400).json({ error: 'رقم مجموعة غير صالح.' });

  const students = await db.getStudents();
  const groups = buildGroups(students);
  const maxGroup = groups.length ? groups[groups.length - 1].number : 0;
  if (group > maxGroup) return res.status(400).json({ error: `المجموعة ${group} غير موجودة (آخر مجموعة ${maxGroup}).` });

  const current = groups.find((g) => g.members.some((m) => m.collegeCode === student.collegeCode));
  if (current && current.number === group)
    return res.status(400).json({ error: 'الطالب موجود بالفعل في هذه المجموعة.' });

  const pinnedInTarget = students.filter(
    (s) => s.manualGroup === group && s.collegeCode !== student.collegeCode
  ).length;
  if (pinnedInTarget >= GROUP_SIZE)
    return res.status(400).json({ error: 'المجموعة المستهدفة ممتلئة بطلاب منقولين يدوياً.' });

  await db.setManualGroup(student.collegeCode, group);
  res.json({ message: `تم نقل ${student.fullName} إلى مجموعة ${group}.` });
}));

app.delete('/api/admin/student/:code', adminOnly, wrap(async (req, res) => {
  const ok = await db.deleteStudent(req.params.code);
  res.status(ok ? 200 : 404).json({ message: ok ? 'تم الحذف.' : 'الكود غير موجود.' });
}));

// ================= المشرف: تصدير Excel =================
app.get('/api/admin/export', adminOnly, wrap(async (req, res) => {
  const students = await db.getStudents();
  const links = await db.getLinks();
  const groups = buildGroups(students);
  const genderAr = (g) => (g === 'male' ? 'شاب' : 'بنت');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Student Groups';

  const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  // --- الورقة 1: كل مجموعة في جدول مستقل ---
  const ws = wb.addWorksheet('المجموعات', { views: [{ rightToLeft: true }] });
  ws.columns = [{ width: 6 }, { width: 34 }, { width: 16 }, { width: 10 }, { width: 18 }, { width: 22 }];

  for (const g of groups) {
    const title = ws.addRow([
      `مجموعة ${g.number} — ${g.complete ? 'مكتملة' : 'مفتوحة'} (${g.members.length} من ${GROUP_SIZE}) — ${g.males} شباب / ${g.females} بنات`,
    ]);
    ws.mergeCells(title.number, 1, title.number, 6);
    title.getCell(1).font = { bold: true, size: 13 };
    title.getCell(1).fill = titleFill;
    title.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    title.height = 24;

    if (links[String(g.number)]) {
      const lr = ws.addRow([`رابط الواتساب: ${links[String(g.number)]}`]);
      ws.mergeCells(lr.number, 1, lr.number, 6);
      lr.getCell(1).alignment = { horizontal: 'right' };
    }

    const head = ws.addRow(['م', 'الاسم الكامل', 'كود الكلية', 'الجنس', 'الهاتف / الواتساب', 'المجموعة الأصلية']);
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = headFill;
      c.alignment = { horizontal: 'center' };
      c.border = border;
    });

    g.members.forEach((m, i) => {
      const r = ws.addRow([i + 1, m.fullName, m.collegeCode, genderAr(m.gender), m.phone, m.originalGroup || '']);
      r.eachCell((c) => { c.border = border; c.alignment = { horizontal: 'center' }; });
      r.getCell(2).alignment = { horizontal: 'right' };
      r.getCell(3).numFmt = '@'; // يحفظ الأصفار في بداية الكود/الرقم
      r.getCell(5).numFmt = '@';
    });
    ws.addRow([]);
  }

  // --- الورقة 2: كل الطلاب في جدول واحد ---
  const all = wb.addWorksheet('كل الطلاب', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  all.columns = [
    { header: 'المجموعة', width: 10 },
    { header: 'الاسم الكامل', width: 34 },
    { header: 'كود الكلية', width: 16 },
    { header: 'الجنس', width: 10 },
    { header: 'الهاتف / الواتساب', width: 18 },
    { header: 'المجموعة الأصلية', width: 22 },
    { header: 'نقل يدوي', width: 10 },
  ];
  all.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = headFill;
    c.alignment = { horizontal: 'center' };
  });
  for (const g of groups) {
    for (const m of g.members) {
      const r = all.addRow([g.number, m.fullName, m.collegeCode, genderAr(m.gender), m.phone, m.originalGroup || '', Number.isInteger(m.manualGroup) ? 'نعم' : '']);
      r.getCell(3).numFmt = '@';
      r.getCell(5).numFmt = '@';
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="groups-${stamp}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// ================= التشغيل =================
db.connect(MONGODB_URI, DB_NAME)
  .then(() => app.listen(PORT, () => console.log(`✅ متصل بـ MongoDB — الموقع يعمل على: http://localhost:${PORT}`)))
  .catch((e) => {
    console.error('❌ تعذّر الاتصال بـ MongoDB:', e.message);
    console.error('تأكد من: 1) الباسورد في .env صحيح  2) من Atlas > Network Access أضفت IP جهازك (أو 0.0.0.0/0)');
    process.exit(1);
  });
