import { pool } from '../config/db.js';

export const getFacultySubjectAssignment = async (userId, subjectId) => {
  const [rows] = await pool.execute(
    `SELECT f.faculty_id AS facultyId
     FROM faculty f
     INNER JOIN faculty_subjects fs
       ON fs.faculty_id = f.faculty_id
     WHERE f.user_id = ?
       AND fs.subject_id = ?
     LIMIT 1`,
    [userId, subjectId]
  );

  return rows[0] ?? null;
};

export const getAttendanceDates = async (subjectId) => {
  const [rows] = await pool.execute(
    `SELECT
       DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendanceDate,
       session_id AS sessionId,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM attendance_sessions
     WHERE subject_id = ?
     ORDER BY attendance_date DESC, session_id DESC`,
    [subjectId]
  );

  return rows.map((row) => ({
    ...row,
    attendanceDate:
      typeof row.attendanceDate === 'string'
        ? row.attendanceDate
        : row.attendanceDate instanceof Date
        ? row.attendanceDate.toISOString().slice(0, 10)
        : String(row.attendanceDate),
  }));
};

export const getAttendanceStudents = async (subjectId, attendanceDate) => {
  const [rows] = await pool.execute(
    `SELECT
       s.student_id AS studentId,
       s.full_name AS fullName,

       CASE
         WHEN totals.totalSessions = 0 THEN 0
         ELSE ROUND(
           COALESCE(stats.presentSessions, 0) * 100.0
           / totals.totalSessions,
           2
         )
       END AS attendancePercentage,

       COALESCE(selected_record.status, 'ABSENT') AS status,
       selected_record.marked_by AS markedBy

     FROM subject_students ss
     INNER JOIN students s
       ON s.student_id = ss.student_id

     LEFT JOIN attendance_sessions selected_session
       ON selected_session.subject_id = ss.subject_id
       AND selected_session.attendance_date = ?

     LEFT JOIN attendance_records selected_record
       ON selected_record.session_id = selected_session.session_id
       AND selected_record.student_id = s.student_id

     CROSS JOIN (
       SELECT COUNT(*) AS totalSessions
       FROM attendance_sessions
       WHERE subject_id = ?
     ) totals

     LEFT JOIN (
       SELECT
         ar.student_id,
         SUM(ar.status = 'PRESENT') AS presentSessions
       FROM attendance_records ar
       INNER JOIN attendance_sessions ses
         ON ses.session_id = ar.session_id
       WHERE ses.subject_id = ?
       GROUP BY ar.student_id
     ) stats
       ON stats.student_id = s.student_id

     WHERE ss.subject_id = ?
     ORDER BY s.full_name ASC, s.student_id ASC`,
    [attendanceDate, subjectId, subjectId, subjectId]
  );

  return rows.map((row) => ({
    ...row,
    attendancePercentage: Number(row.attendancePercentage),
  }));
};



export const getEnrolledStudentsWithFaceEmbeddings = async (
  subjectId
) => {
  const [rows] = await pool.execute(
    `SELECT
       s.student_id AS studentId,
       sb.face_embedding AS faceEmbedding,
       sb.face_model_version AS faceModelVersion
     FROM subject_students ss
     INNER JOIN students s
       ON s.student_id = ss.student_id
     LEFT JOIN student_biometrics sb
       ON sb.student_id = s.student_id
     WHERE ss.subject_id = ?
     ORDER BY s.student_id ASC`,
    [subjectId]
  );

  return rows;
};

  
export const saveAttendanceSession = async ({
  subjectId,
  attendanceDate,
  facultyId,
  students,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Get the current enrolled students.
    const [enrolledRows] = await connection.execute(
      `SELECT student_id AS studentId
       FROM subject_students
       WHERE subject_id = ?
       ORDER BY student_id ASC
       FOR UPDATE`,
      [subjectId]
    );

    const enrolledIds = enrolledRows.map(
      (row) => Number(row.studentId)
    );

    const submittedIds = students
      .map((student) => student.studentId)
      .sort((a, b) => a - b);

    if (enrolledIds.length === 0) {
      const error = new Error(
        'No students are enrolled in this subject.'
      );
      error.statusCode = 422;
      throw error;
    }

    // The frontend must submit every enrolled student exactly once.
    if (
      enrolledIds.length !== submittedIds.length ||
      enrolledIds.some((id, index) => id !== submittedIds[index])
    ) {
      const error = new Error(
        'Attendance must include every enrolled student exactly once.'
      );
      error.statusCode = 400;
      throw error;
    }

    // 2. Create a session, or reuse the existing session for this date.
    const [sessionResult] = await connection.execute(
      `INSERT INTO attendance_sessions
         (subject_id, attendance_date, created_by_faculty_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         session_id = LAST_INSERT_ID(session_id),
         updated_at = CURRENT_TIMESTAMP`,
      [subjectId, attendanceDate, facultyId]
    );

    let sessionId = sessionResult.insertId;

    if (!sessionId) {
      const [existingRows] = await connection.execute(
        `SELECT session_id AS sessionId
         FROM attendance_sessions
         WHERE subject_id = ? AND attendance_date = ?
         LIMIT 1`,
        [subjectId, attendanceDate]
      );
      sessionId = existingRows[0]?.sessionId;
    }

    // 3. Insert or update all attendance records.
    const records = students.map((student) => [
      sessionId,
      student.studentId,
      student.status,
      'FACULTY',
    ]);

    await connection.query(
      `INSERT INTO attendance_records
         (session_id, student_id, status, marked_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         marked_by = 'FACULTY',
         updated_at = CURRENT_TIMESTAMP`,
      [records]
    );

    await connection.commit();

    const presentCount = students.filter(
      (student) => student.status === 'PRESENT'
    ).length;

    return {
      sessionId,
      subjectId,
      attendanceDate,
      totalStudents: students.length,
      presentCount,
      absentCount: students.length - presentCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};