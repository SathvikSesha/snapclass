import { pool } from '../config/db.js';

export const getSubjectRequests = async (status = 'PENDING') => {
  const normalized = status ? String(status).trim().toUpperCase() : 'PENDING';
  const hasFilter = normalized && normalized !== 'ALL';

  const query = `
    SELECT
       r.id,
       r.status,
       r.requested_at AS requestedAt,
       r.reviewed_at AS reviewedAt,
       r.review_note AS reviewNote,
       s.id AS subjectId,
       s.subject_code AS subjectCode,
       s.name AS subjectName,
       s.credits,
       f.faculty_id AS facultyId,
       u.user_id AS facultyUserId,
       f.full_name AS facultyName,
       u.email AS facultyEmail
     FROM subject_requests r
     JOIN subjects s ON s.id = r.subject_id
     JOIN faculty f ON f.faculty_id = r.faculty_id
     JOIN users u ON u.user_id = f.user_id
     ${hasFilter ? 'WHERE r.status = ?' : ''}
     ORDER BY r.requested_at DESC, r.id DESC
  `;

  const [rows] = hasFilter
    ? await pool.execute(query, [normalized])
    : await pool.execute(query);

  return rows;
};

export const getRequestForUpdate = async (requestId, connection) => {
  const [rows] = await connection.execute(
    `SELECT id, subject_id, faculty_id, status
     FROM subject_requests
     WHERE id = ?
     FOR UPDATE`,
    [requestId]
  );

  return rows[0] ?? null;
};

export const approveFacultyAssignment = async (
  subjectId,
  facultyId,
  connection
) => {
  await connection.execute(
    `INSERT INTO faculty_subjects (subject_id, faculty_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE faculty_id = VALUES(faculty_id)`,
    [subjectId, facultyId]
  );
};

export const revokeFacultyAssignment = async (
  subjectId,
  facultyId,
  connection
) => {
  await connection.execute(
    `DELETE FROM faculty_subjects
     WHERE subject_id = ? AND faculty_id = ?`,
    [subjectId, facultyId]
  );
};

export const reviewRequest = async (
  { requestId, status, adminUserId, reviewNote },
  connection
) => {
  const [result] = await connection.execute(
    `UPDATE subject_requests
     SET status = ?,
         reviewed_by_admin_user_id = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         review_note = ?
     WHERE id = ?`,
    [status, adminUserId, reviewNote ?? null, requestId]
  );

  return result.affectedRows;
};
