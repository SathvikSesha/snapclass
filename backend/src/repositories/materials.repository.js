import { pool } from '../config/db.js';

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

export const getStudentIdByUserId = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT student_id
     FROM students
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0]?.student_id ?? null;
};

export const isFacultyAssignedToSubject = async (
  facultyId,
  subjectId
) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM faculty_subjects
     WHERE faculty_id = ?
       AND subject_id = ?
     LIMIT 1`,
    [facultyId, subjectId]
  );

  return rows.length > 0;
};

export const isStudentEnrolledInSubject = async (
  studentId,
  subjectId
) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM subject_students
     WHERE student_id = ?
       AND subject_id = ?
     LIMIT 1`,
    [studentId, subjectId]
  );

  return rows.length > 0;
};

export const getAvailableMaterialsBySubject = async (subjectId) => {
  const [rows] = await pool.execute(
    `SELECT
       material_id AS materialId,
       subject_id AS subjectId,
       title,
       description,
       original_filename AS originalFilename,
       file_type AS fileType,
       file_size AS fileSize,
       status,
       ingestion_status AS ingestionStatus,
       ingestion_error AS ingestionError,
       ingested_at AS ingestedAt,
       created_at AS createdAt
     FROM subject_materials
     WHERE subject_id = ?
       AND status = 'AVAILABLE'
     ORDER BY created_at DESC, material_id DESC`,
    [subjectId]
  );

  return rows.map((row) => ({
    ...row,
    fileSize: Number(row.fileSize),
  }));
};

export const getAvailableMaterialById = async (materialId) => {
  const [rows] = await pool.execute(
    `SELECT
       material_id AS materialId,
       subject_id AS subjectId,
       uploaded_by_faculty_id AS uploadedByFacultyId,
       title,
       original_filename AS originalFilename,
       object_key AS objectKey,
       file_type AS fileType,
       file_size AS fileSize,
       status
     FROM subject_materials
     WHERE material_id = ?
       AND status = 'AVAILABLE'
     LIMIT 1`,
    [materialId]
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    fileSize: Number(rows[0].fileSize),
  };
};