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

export const isFacultyAssignedToSubject = async (facultyId, subjectId) => {
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

export const createPendingMaterial = async ({
  subjectId,
  facultyId,
  title,
  description,
  originalFilename,
  objectKey,
  fileType,
  fileSize,
}) => {
  const [result] = await pool.execute(
    `INSERT INTO subject_materials (
       subject_id,
       uploaded_by_faculty_id,
       title,
       description,
       original_filename,
       object_key,
       file_type,
       file_size,
       status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      subjectId,
      facultyId,
      title,
      description,
      originalFilename,
      objectKey,
      fileType,
      fileSize,
    ]
  );

  return result.insertId;
};

export const getPendingMaterialForFaculty = async (
  materialId,
  facultyId
) => {
  const [rows] = await pool.execute(
    `SELECT
       material_id AS materialId,
       subject_id AS subjectId,
       uploaded_by_faculty_id AS facultyId,
       object_key AS objectKey,
       file_type AS fileType,
       file_size AS fileSize,
       status
     FROM subject_materials
     WHERE material_id = ?
       AND uploaded_by_faculty_id = ?
     LIMIT 1`,
    [materialId, facultyId]
  );

  return rows[0] ?? null;
};

export const markMaterialAvailable = async (materialId, facultyId) => {
  const [result] = await pool.execute(
    `UPDATE subject_materials
     SET status = 'AVAILABLE'
     WHERE material_id = ?
       AND uploaded_by_faculty_id = ?
       AND status = 'PENDING'`,
    [materialId, facultyId]
  );

  return result.affectedRows > 0;
};

export const markMaterialFailed = async (materialId, facultyId) => {
  const [result] = await pool.execute(
    `UPDATE subject_materials
     SET status = 'FAILED'
     WHERE material_id = ?
       AND uploaded_by_faculty_id = ?
       AND status = 'PENDING'`,
    [materialId, facultyId]
  );

  return result.affectedRows > 0;
};