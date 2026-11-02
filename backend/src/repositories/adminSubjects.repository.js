
import { pool } from '../config/db.js';

export const createSubject = async (
  { subjectCode, name, description, adminUserId },
  connection = pool
) => {
  const [result] = await connection.execute(
    `INSERT INTO subjects
      (subject_code, name, description, created_by_admin_user_id)
     VALUES (?, ?, ?, ?)`,
    [subjectCode, name, description ?? null, adminUserId]
  );

  return result.insertId;
};

export const getAllSubjects = async () => {
  const [rows] = await pool.execute(`
    SELECT
      s.id,
      s.subject_code AS subjectCode,
      s.name,
      s.description,
      s.created_at AS createdAt,
      COUNT(DISTINCT fs.faculty_id) AS facultyCount,
      COUNT(DISTINCT ss.student_id) AS studentCount
    FROM subjects s
    LEFT JOIN faculty_subjects fs ON fs.subject_id = s.id
    LEFT JOIN subject_students ss ON ss.subject_id = s.id
    GROUP BY
      s.id, s.subject_code, s.name, s.description, s.created_at
    ORDER BY s.created_at DESC, s.id DESC
  `);

  return rows.map((row) => ({
    ...row,
    facultyCount: Number(row.facultyCount),
    studentCount: Number(row.studentCount),
  }));
};

export const getSubjectById = async (subjectId, connection = pool) => {
  const [rows] = await connection.execute(
    'SELECT id, subject_code FROM subjects WHERE id = ?',
    [subjectId]
  );

  return rows[0] ?? null;
};
