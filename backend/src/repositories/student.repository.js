
import { pool } from '../config/db.js';

const FACE_MATCH_THRESHOLD = 0.5;
const FACE_REGISTRATION_LOCK = 'snapclass_student_face_registration';

function parseEmbedding(value) {
  const embedding =
    typeof value === 'string' ? JSON.parse(value) : value;

  if (
    !Array.isArray(embedding) ||
    embedding.length !== 128 ||
    !embedding.every(
      number => typeof number === 'number' && Number.isFinite(number)
    )
  ) {
    throw new Error('Invalid stored face embedding.');
  }

  return embedding;
}

function calculateEuclideanDistance(embeddingA, embeddingB) {
  let sum = 0;

  for (let i = 0; i < 128; i++) {
    const difference = embeddingA[i] - embeddingB[i];
    sum += difference * difference;
  }

  return Math.sqrt(sum);
}

async function findMatchingStudent(connection, newEmbedding) {
  const [rows] = await connection.execute(
    `SELECT student_id, face_embedding
     FROM student_biometrics`
  );

  for (const row of rows) {
    const existingEmbedding = parseEmbedding(row.face_embedding);

    const distance = calculateEuclideanDistance(
      newEmbedding,
      existingEmbedding
    );

    if (distance <= FACE_MATCH_THRESHOLD) {
      return {
        studentId: row.student_id,
        distance,
      };
    }
  }

  return null;
}

export async function createStudentRecords({
  email,
  passwordHash,
  fullName,
  faceEmbedding,
  voiceEmbedding = null,
}) {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;

  try {
    // Serialize student registrations so two requests cannot
    // both pass the face-duplicate check simultaneously.
    const [lockRows] = await connection.execute(
      'SELECT GET_LOCK(?, 10) AS acquired',
      [FACE_REGISTRATION_LOCK]
    );

    if (Number(lockRows[0].acquired) !== 1) {
      const error = new Error(
        'Registration is busy. Please try again.'
      );
      error.statusCode = 503;
      throw error;
    }

    lockAcquired = true;

    await connection.beginTransaction();
    transactionStarted = true;

    const match = await findMatchingStudent(
      connection,
      faceEmbedding
    );

    if (match) {
      const error = new Error(
        'This face is already registered. Please log in with your existing account.'
      );
      error.code = 'DUPLICATE_FACE';
      throw error;
    }

    const [userResult] = await connection.execute(
      `INSERT INTO users
        (email, password_hash, role, status, email_verified)
       VALUES (?, ?, 'STUDENT', 'ACTIVE', FALSE)`,
      [email, passwordHash]
    );

    const userId = userResult.insertId;

    const [studentResult] = await connection.execute(
      `INSERT INTO students (user_id, full_name)
       VALUES (?, ?)`,
      [userId, fullName]
    );

    const studentId = studentResult.insertId;

    await connection.execute(
      `INSERT INTO student_biometrics
        (student_id, face_embedding, voice_embedding, face_model_version)
       VALUES (?, ?, ?, ?)`,
      [
        studentId,
        JSON.stringify(faceEmbedding),
        voiceEmbedding ? JSON.stringify(voiceEmbedding) : null,
        'dlib-128-v1',
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return { userId, studentId };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Student registration rollback failed:', rollbackError);
      }
    }

    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute(
          'SELECT RELEASE_LOCK(?)',
          [FACE_REGISTRATION_LOCK]
        );
      } catch (lockError) {
        console.error('Could not release face registration lock:', lockError);
      }
    }

    connection.release();
  }
}

export const getStudentDashboardData = async (userId) => {
  const [studentRows] = await pool.execute(
    `SELECT
       s.student_id AS studentId,
       s.full_name AS fullName,
       u.email AS email
     FROM students s
     INNER JOIN users u ON u.user_id = s.user_id
     WHERE s.user_id = ?
       AND u.role = 'STUDENT'
       AND u.status = 'ACTIVE'
     LIMIT 1`,
    [userId]
  );

  if (studentRows.length === 0) {
    return null;
  }

  const student = studentRows[0];

  const [subjectRows] = await pool.execute(
    `SELECT COUNT(*) AS registeredSubjects
     FROM subject_students
     WHERE student_id = ?`,
    [student.studentId]
  );

  const [activityRows] = await pool.execute(
    `SELECT
       event_type AS eventType,
       message,
       entity_type AS entityType,
       entity_id AS entityId,
       created_at AS createdAt
     FROM logs
     ORDER BY created_at DESC, id DESC
     LIMIT 10`
  );

  return {
    student,
    registeredSubjects: Number(subjectRows[0].registeredSubjects),
    recentActivity: activityRows,
  };
};

export const getStudentSubjectCatalog = async (userId) => {
  const [studentRows] = await pool.execute(
    `SELECT s.student_id AS studentId
     FROM students s
     INNER JOIN users u ON u.user_id = s.user_id
     WHERE s.user_id = ?
       AND u.role = 'STUDENT'
       AND u.status = 'ACTIVE'
     LIMIT 1`,
    [userId]
  );

  if (studentRows.length === 0) {
    return null;
  }

  const studentId = Number(studentRows[0].studentId);

  const [subjects] = await pool.execute(
    `SELECT
       sub.id AS subjectId,
       sub.subject_code AS subjectCode,
       sub.name AS subjectName,
       sub.description,
       sub.credits,
       CASE
         WHEN ss.student_id IS NOT NULL THEN TRUE
         ELSE FALSE
       END AS isRegistered,
       ss.enrolled_at AS enrolledAt
     FROM subjects sub
     LEFT JOIN subject_students ss
       ON ss.subject_id = sub.id
       AND ss.student_id = ?
     ORDER BY sub.subject_code ASC, sub.name ASC`,
    [studentId]
  );

  return subjects.map((subject) => ({
    ...subject,
    subjectId: Number(subject.subjectId),
    credits: Number(subject.credits),
    isRegistered: Boolean(subject.isRegistered),
  }));
};


export const getStudentRegistrationWindow = async () => {
  const [rows] = await pool.execute(`
    SELECT
      id,
      starts_at AS startsAt,
      ends_at AS endsAt,
      CASE
        WHEN starts_at <= NOW() AND ends_at > NOW()
          THEN 'OPEN'
        WHEN starts_at > NOW()
          THEN 'UPCOMING'
        ELSE 'CLOSED'
      END AS status
    FROM course_registration_windows
    ORDER BY
      CASE
        WHEN starts_at <= NOW() AND ends_at > NOW() THEN 0
        WHEN starts_at > NOW() THEN 1
        ELSE 2
      END ASC,
      CASE WHEN starts_at > NOW() THEN starts_at END ASC,
      CASE WHEN ends_at <= NOW() THEN ends_at END DESC
    LIMIT 1
  `);

  return rows[0] ?? null;
};



export const registerStudentForSubject = async ({
  userId,
  subjectId,
  creditLimit = 30,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the student's row to serialize registration requests.
    const [studentRows] = await connection.execute(
      `SELECT s.student_id AS studentId
       FROM students s
       INNER JOIN users u ON u.user_id = s.user_id
       WHERE s.user_id = ?
         AND u.role = 'STUDENT'
         AND u.status = 'ACTIVE'
       FOR UPDATE`,
      [userId]
    );

    if (studentRows.length === 0) {
      const error = new Error('Active student profile not found.');
      error.statusCode = 404;
      throw error;
    }

    const studentId = Number(studentRows[0].studentId);

    // 2. Verify that registration is currently open.
    const [windowRows] = await connection.execute(
      `SELECT id
       FROM course_registration_windows
       WHERE starts_at <= NOW()
         AND ends_at > NOW()
       ORDER BY starts_at DESC
       LIMIT 1`,
    );

    if (windowRows.length === 0) {
      const error = new Error(
        'Subject registration is not currently open.'
      );
      error.statusCode = 403;
      error.code = 'REGISTRATION_CLOSED';
      throw error;
    }

    // 3. Verify that the subject exists.
    const [subjectRows] = await connection.execute(
      `SELECT id, credits
       FROM subjects
       WHERE id = ?`,
      [subjectId]
    );

    if (subjectRows.length === 0) {
      const error = new Error('Subject not found.');
      error.statusCode = 404;
      throw error;
    }

    const subjectCredits = Number(subjectRows[0].credits);

    // 4. Prevent duplicate enrollment.
    const [existingRows] = await connection.execute(
      `SELECT subject_id
       FROM subject_students
       WHERE subject_id = ? AND student_id = ?`,
      [subjectId, studentId]
    );

    if (existingRows.length > 0) {
      const error = new Error('You are already registered for this subject.');
      error.statusCode = 409;
      error.code = 'ALREADY_REGISTERED';
      throw error;
    }

    // 5. Calculate the student's current registered credits.
    const [creditRows] = await connection.execute(
      `SELECT COALESCE(SUM(sub.credits), 0) AS registeredCredits
       FROM subject_students ss
       INNER JOIN subjects sub ON sub.id = ss.subject_id
       WHERE ss.student_id = ?`,
      [studentId]
    );

    const registeredCredits = Number(creditRows[0].registeredCredits);

    if (registeredCredits + subjectCredits > creditLimit) {
      const error = new Error(
        `This subject exceeds your ${creditLimit}-credit limit. ` +
        `You have ${creditLimit - registeredCredits} credits remaining.`
      );
      error.statusCode = 409;
      error.code = 'CREDIT_LIMIT_EXCEEDED';
      throw error;
    }

    // 6. Enroll the student.
    await connection.execute(
      `INSERT INTO subject_students (subject_id, student_id)
       VALUES (?, ?)`,
      [subjectId, studentId]
    );

    const updatedCredits = registeredCredits + subjectCredits;

    await connection.commit();

    return {
      subjectId: Number(subjectId),
      registered: true,
      registeredCredits: updatedCredits,
      creditLimit,
      remainingCredits: creditLimit - updatedCredits,
    };
  } catch (error) {
    await connection.rollback();

    // The database primary key is a final safeguard against duplicates.
    if (error.code === 'ER_DUP_ENTRY') {
      error.statusCode = 409;
      error.message = 'You are already registered for this subject.';
    }

    throw error;
  } finally {
    connection.release();
  }
};


export const getStudentAttendanceSummary = async ({
  userId,
  subjectId,
}) => {
  const [enrollmentRows] = await pool.execute(
    `SELECT
       sub.id AS subjectId,
       sub.subject_code AS subjectCode,
       sub.name AS subjectName,
       s.student_id AS studentId
     FROM subjects sub
     INNER JOIN subject_students ss
       ON ss.subject_id = sub.id
     INNER JOIN students s
       ON s.student_id = ss.student_id
     INNER JOIN users u
       ON u.user_id = s.user_id
     WHERE sub.id = ?
       AND u.user_id = ?
       AND u.role = 'STUDENT'
       AND u.status = 'ACTIVE'
     LIMIT 1`,
    [subjectId, userId]
  );

  if (enrollmentRows.length === 0) {
    const [subjectRows] = await pool.execute(
      'SELECT id FROM subjects WHERE id = ? LIMIT 1',
      [subjectId]
    );

    if (subjectRows.length === 0) {
      return { error: 'SUBJECT_NOT_FOUND' };
    }

    return { error: 'NOT_ENROLLED' };
  }

  const student = enrollmentRows[0];

  const [summaryRows] = await pool.execute(
    `SELECT
       COUNT(*) AS totalSessions,
       COALESCE(SUM(
         CASE WHEN ar.status = 'PRESENT' THEN 1 ELSE 0 END
       ), 0) AS presentCount,
       COALESCE(SUM(
         CASE WHEN ar.status = 'ABSENT' THEN 1 ELSE 0 END
       ), 0) AS absentCount
     FROM attendance_sessions ats
     INNER JOIN attendance_records ar
       ON ar.session_id = ats.session_id
     WHERE ats.subject_id = ?
       AND ar.student_id = ?`,
    [subjectId, student.studentId]
  );

  const totalSessions = Number(summaryRows[0].totalSessions);
  const presentCount = Number(summaryRows[0].presentCount);
  const absentCount = Number(summaryRows[0].absentCount);

  return {
    subject: {
      subjectId: Number(student.subjectId),
      subjectCode: student.subjectCode,
      subjectName: student.subjectName,
    },
    totalSessions,
    presentCount,
    absentCount,
    attendancePercentage: totalSessions === 0
      ? 0
      : Number(((presentCount / totalSessions) * 100).toFixed(2)),
  };
};


export const getStudentAttendanceHistory = async ({
  userId,
  subjectId,
}) => {
  const [enrollmentRows] = await pool.execute(
    `SELECT s.student_id AS studentId
     FROM subject_students ss
     INNER JOIN students s ON s.student_id = ss.student_id
     INNER JOIN users u ON u.user_id = s.user_id
     WHERE ss.subject_id = ?
       AND u.user_id = ?
       AND u.role = 'STUDENT'
       AND u.status = 'ACTIVE'
     LIMIT 1`,
    [subjectId, userId]
  );

  if (enrollmentRows.length === 0) {
    const [subjectRows] = await pool.execute(
      'SELECT id FROM subjects WHERE id = ? LIMIT 1',
      [subjectId]
    );

    if (subjectRows.length === 0) {
      return { error: 'SUBJECT_NOT_FOUND' };
    }

    return { error: 'NOT_ENROLLED' };
  }

  const studentId = Number(enrollmentRows[0].studentId);

  const [rows] = await pool.execute(
    `SELECT
       ats.session_id AS sessionId,
       ats.attendance_date AS attendanceDate,
       ar.status,
       ar.marked_by AS markedBy,
       ar.updated_at AS updatedAt
     FROM attendance_sessions ats
     INNER JOIN attendance_records ar
       ON ar.session_id = ats.session_id
     WHERE ats.subject_id = ?
       AND ar.student_id = ?
     ORDER BY ats.attendance_date DESC, ats.session_id DESC`,
    [subjectId, studentId]
  );

  return rows.map((row) => ({
    ...row,
    sessionId: Number(row.sessionId),
    status: row.status,
  }));
};

