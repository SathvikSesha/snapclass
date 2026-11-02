import { pool } from '../config/db.js';

export const getAllSubjectsForFaculty = async (userId, connection = pool) => {
  const [rows] = await connection.execute(
    `SELECT
       s.id,
       s.subject_code AS subjectCode,
       s.name,
       s.description,

       CASE
         WHEN fs.faculty_id IS NOT NULL THEN TRUE
         ELSE FALSE
       END AS isTeaching,

       sr.status AS requestStatus

     FROM subjects s

     INNER JOIN faculty f
       ON f.user_id = ?

     LEFT JOIN faculty_subjects fs
       ON fs.subject_id = s.id
       AND fs.faculty_id = f.faculty_id

     LEFT JOIN subject_requests sr
       ON sr.subject_id = s.id
       AND sr.faculty_id = f.faculty_id

     ORDER BY
       CASE WHEN fs.faculty_id IS NOT NULL THEN 0 ELSE 1 END,
       s.name ASC`,
    [userId]
  );

  return rows.map((subject) => {
    const isTeaching = Boolean(subject.isTeaching);

    return {
      ...subject,
      isTeaching,
      canRequest: !isTeaching && (subject.requestStatus === null || subject.requestStatus === undefined),
    };
  });
};

export const facultyProfileExists = async (userId, connection = pool) => {
  const [rows] = await connection.execute(
    'SELECT faculty_id FROM faculty WHERE user_id = ? LIMIT 1',
    [userId]
  );

  return rows.length > 0;
};

export const getFacultyByUserId = async (userId, connection = pool) => {
  const [rows] = await connection.execute(
    `SELECT
       f.faculty_id,
       f.user_id,
       f.full_name,
       u.email
     FROM faculty f
     JOIN users u ON u.user_id = f.user_id
     WHERE f.user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
};

export const getSubjectById = async (subjectId, connection = pool) => {
  const [rows] = await connection.execute(
    'SELECT id, subject_code AS subjectCode, name FROM subjects WHERE id = ? LIMIT 1',
    [subjectId]
  );

  return rows[0] ?? null;
};

export const isFacultyTeachingSubject = async (facultyId, subjectId, connection = pool) => {
  const [rows] = await connection.execute(
    'SELECT 1 FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ? LIMIT 1',
    [facultyId, subjectId]
  );

  return rows.length > 0;
};

export const getExistingSubjectRequest = async (facultyId, subjectId, connection = pool) => {
  const [rows] = await connection.execute(
    `SELECT id, status
     FROM subject_requests
     WHERE faculty_id = ? AND subject_id = ?
     LIMIT 1
     FOR UPDATE`,
    [facultyId, subjectId]
  );

  return rows[0] ?? null;
};

export const createSubjectRequest = async ({ subjectId, facultyId }, connection = pool) => {
  const [result] = await connection.execute(
    'INSERT INTO subject_requests (subject_id, faculty_id, status) VALUES (?, ?, ?)',
    [subjectId, facultyId, 'PENDING']
  );

  return result.insertId;
};
