import { pool } from '../config/db.js';

export const getFacultyProfileByUserId = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT
       f.faculty_id AS facultyId,
       f.full_name AS fullName,
       u.user_id AS userId,
       u.email
     FROM faculty f
     JOIN users u ON u.user_id = f.user_id
     WHERE f.user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
};

export const getFacultyIdByUserId = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT faculty_id
     FROM faculty
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0]?.faculty_id ?? null;
};

export const getTeachingSubjects = async (facultyId) => {
  const [rows] = await pool.execute(
    `SELECT
       s.id,
       s.subject_code AS subjectCode,
       s.name,
       s.description,
       fs.assigned_at AS assignedAt,
       COUNT(DISTINCT ss.student_id) AS studentCount
     FROM faculty_subjects fs
     INNER JOIN subjects s
       ON s.id = fs.subject_id
     LEFT JOIN subject_students ss
       ON ss.subject_id = s.id
     WHERE fs.faculty_id = ?
     GROUP BY s.id, s.subject_code, s.name, s.description, fs.assigned_at
     ORDER BY s.name ASC`,
    [facultyId]
  );

  return rows.map((row) => ({
    ...row,
    studentCount: Number(row.studentCount),
  }));
};

