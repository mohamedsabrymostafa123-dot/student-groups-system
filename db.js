// طبقة التخزين: MongoDB Atlas
const { MongoClient } = require('mongodb');

let client, students, links;

const normalizeCode = (c) => String(c).trim().toUpperCase();

async function connect(uri, dbName = 'student_groups') {
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  students = db.collection('students');
  links = db.collection('links');
  // فهرس فريد: MongoDB نفسه يمنع تكرار كود الكلية حتى لو سُجّل طالبان في نفس اللحظة
  await students.createIndex({ collegeCode: 1 }, { unique: true });
}

async function getStudents() {
  return students.find({}, { projection: { _id: 0 } }).toArray();
}

async function findByCode(code) {
  return students.findOne({ collegeCode: normalizeCode(code) }, { projection: { _id: 0 } });
}

async function addStudent({ fullName, collegeCode, gender, phone, originalGroup }) {
  const doc = {
    fullName: String(fullName).trim(),
    collegeCode: normalizeCode(collegeCode),
    gender, // 'male' | 'female'
    phone: String(phone).trim(),
    originalGroup: originalGroup ? String(originalGroup).trim() : '',
    createdAt: new Date().toISOString(),
  };
  try {
    await students.insertOne(doc);
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error('DUPLICATE_CODE');
      err.code = 'DUPLICATE_CODE';
      throw err;
    }
    throw e;
  }
  return doc;
}

async function deleteStudent(code) {
  const r = await students.deleteOne({ collegeCode: normalizeCode(code) });
  return r.deletedCount > 0;
}

// نقل يدوي: group = رقم المجموعة، أو null لإلغاء النقل والرجوع للتوزيع التلقائي
async function setManualGroup(code, group) {
  const update = group === null ? { $unset: { manualGroup: '' } } : { $set: { manualGroup: group } };
  const r = await students.updateOne({ collegeCode: normalizeCode(code) }, update);
  return r.matchedCount > 0;
}

async function getLinks() {
  const rows = await links.find({}).toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.link]));
}

async function setLink(groupNumber, link) {
  const id = String(groupNumber);
  if (link) await links.replaceOne({ _id: id }, { _id: id, link }, { upsert: true });
  else await links.deleteOne({ _id: id });
}

module.exports = {
  connect, getStudents, findByCode, addStudent, deleteStudent,
  setManualGroup, getLinks, setLink, normalizeCode,
};
