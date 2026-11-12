
import { pool } from '../config/db.js';

export const getRegistrationWindow = async () => {
  const [rows] = await pool.execute(`
    SELECT
      id,
      starts_at AS startsAt,
      ends_at AS endsAt,
      created_by_admin_user_id AS createdByAdminUserId,
      created_at AS createdAt,
      updated_at AS updatedAt,
      CASE
        WHEN starts_at <= NOW() AND ends_at >= NOW()
          THEN 'OPEN'
        WHEN starts_at > NOW()
          THEN 'UPCOMING'
        ELSE 'CLOSED'
      END AS status
    FROM course_registration_windows
    ORDER BY
      CASE
        WHEN starts_at <= NOW() AND ends_at >= NOW() THEN 0
        WHEN starts_at > NOW() THEN 1
        ELSE 2
      END ASC,
      CASE WHEN starts_at > NOW() THEN starts_at END ASC,
      CASE WHEN ends_at < NOW() THEN ends_at END DESC
    LIMIT 1
  `);

  return rows[0] ?? null;
};



export const createRegistrationWindow = async ({
  startsAt,
  endsAt,
  adminUserId,
}) => {
  const connection = await pool.getConnection();
  let lockAcquired = false;

  try {
    await connection.beginTransaction();

    const [lockRows] = await connection.execute(
      `SELECT GET_LOCK('snapclass_registration_schedule', 5) AS acquired`
    );

    if (Number(lockRows[0].acquired) !== 1) {
      const error = new Error(
        'Registration schedule is busy. Please try again.'
      );
      error.statusCode = 503;
      throw error;
    }

    lockAcquired = true;

    const [overlapping] = await connection.execute(
      `SELECT id
       FROM course_registration_windows
       WHERE starts_at < ?
         AND ends_at > ?
       LIMIT 1`,
      [endsAt, startsAt]
    );

    if (overlapping.length > 0) {
      const error = new Error(
        'This registration window overlaps an existing window.'
      );
      error.statusCode = 409;
      throw error;
    }

    const [result] = await connection.execute(
      `INSERT INTO course_registration_windows
        (starts_at, ends_at, created_by_admin_user_id)
       VALUES (?, ?, ?)`,
      [startsAt, endsAt, adminUserId]
    );

    await connection.commit();

    return {
      id: result.insertId,
      startsAt,
      endsAt,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute(
          `SELECT RELEASE_LOCK('snapclass_registration_schedule')`
        );
      } catch (error) {
        console.error('Failed to release registration schedule lock:', error);
      }
    }

    connection.release();
  }
};


export const updateRegistrationWindow = async ({
  windowId,
  startsAt,
  endsAt,
}) => {
  const connection = await pool.getConnection();
  let lockAcquired = false;

  try {
    await connection.beginTransaction();

    const [lockRows] = await connection.execute(
      `SELECT GET_LOCK('snapclass_registration_schedule', 5) AS acquired`
    );

    if (Number(lockRows[0].acquired) !== 1) {
      const error = new Error(
        'Registration schedule is busy. Please try again.'
      );
      error.statusCode = 503;
      throw error;
    }

    lockAcquired = true;

    const [existingRows] = await connection.execute(
      `SELECT id, starts_at AS startsAt, ends_at AS endsAt
       FROM course_registration_windows
       WHERE id = ?
       FOR UPDATE`,
      [windowId]
    );

    if (existingRows.length === 0) {
      const error = new Error('Registration window not found.');
      error.statusCode = 404;
      throw error;
    }

    const existing = existingRows[0];

    // Do not edit a window that has already opened or ended.
    const [timeRows] = await connection.execute(
      `SELECT NOW() AS currentTime`
    );

    if (new Date(existing.startsAt) <= new Date(timeRows[0].currentTime)) {
      const error = new Error(
        'Only registration windows that have not started can be updated.'
      );
      error.statusCode = 409;
      throw error;
    }

    const [overlapping] = await connection.execute(
      `SELECT id
       FROM course_registration_windows
       WHERE id <> ?
         AND starts_at < ?
         AND ends_at > ?
       LIMIT 1`,
      [windowId, endsAt, startsAt]
    );

    if (overlapping.length > 0) {
      const error = new Error(
        'This registration window overlaps another window.'
      );
      error.statusCode = 409;
      throw error;
    }

    await connection.execute(
      `UPDATE course_registration_windows
       SET starts_at = ?, ends_at = ?
       WHERE id = ?`,
      [startsAt, endsAt, windowId]
    );

    await connection.commit();

    return {
      id: Number(windowId),
      startsAt,
      endsAt,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute(
          `SELECT RELEASE_LOCK('snapclass_registration_schedule')`
        );
      } catch (error) {
        console.error('Failed to release registration schedule lock:', error);
      }
    }

    connection.release();
  }
};

export const getAllStudents = async () => {
  const [rows] = await pool.execute(
    `SELECT
       s.student_id AS studentId,
       s.full_name AS fullName,
       u.email,
       u.status,
       u.created_at AS joinedAt,
       (
         SELECT COUNT(*)
         FROM subject_students ss
         WHERE ss.student_id = s.student_id
       ) AS registeredSubjects
     FROM students s
     INNER JOIN users u ON u.user_id = s.user_id
     WHERE u.role = 'STUDENT'
     ORDER BY s.full_name ASC`
  );

  return rows.map((student) => ({
    studentId: Number(student.studentId),
    fullName: student.fullName,
    email: student.email,
    status: student.status,
    registeredSubjects: Number(student.registeredSubjects),
  }));
};

export const getStudentRegisteredSubjects = async (studentId) => {
  const [rows] = await pool.execute(
    `SELECT
       s.student_id AS studentId,
       s.full_name AS fullName,
       u.email,
       sub.id AS subjectId,
       sub.subject_code AS subjectCode,
       sub.name AS subjectName,
       sub.credits,
       ss.enrolled_at AS enrolledAt
     FROM students s
     INNER JOIN users u ON u.user_id = s.user_id
     LEFT JOIN subject_students ss
       ON ss.student_id = s.student_id
     LEFT JOIN subjects sub
       ON sub.id = ss.subject_id
     WHERE s.student_id = ?
       AND u.role = 'STUDENT'
     ORDER BY sub.subject_code ASC`,
    [studentId]
  );

  if (rows.length === 0) {
    return null;
  }

  const student = {
    studentId: Number(rows[0].studentId),
    fullName: rows[0].fullName,
    email: rows[0].email,
    subjects: [],
  };

  for (const row of rows) {
    if (row.subjectId !== null) {
      student.subjects.push({
        subjectId: Number(row.subjectId),
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        credits: Number(row.credits),
      });
    }
  }

  student.totalSubjects = student.subjects.length;
  student.totalCredits = student.subjects.reduce(
    (total, subject) => total + subject.credits,
    0
  );

  return student;
};

export const getAllFaculty = async () => {
  const [rows] = await pool.execute(
    `SELECT
       f.faculty_id AS facultyId,
       f.full_name AS fullName,
       u.email,
       u.status,
       u.created_at AS joinedAt,
       (
         SELECT COUNT(*)
         FROM faculty_subjects fs
         WHERE fs.faculty_id = f.faculty_id
       ) AS assignedSubjects
     FROM faculty f
     INNER JOIN users u ON u.user_id = f.user_id
     WHERE u.role = 'FACULTY'
     ORDER BY f.full_name ASC`
  );

  return rows.map((faculty) => ({
    facultyId: Number(faculty.facultyId),
    fullName: faculty.fullName,
    email: faculty.email,
    status: faculty.status,
    assignedSubjects: Number(faculty.assignedSubjects),
  }));
};


export const getFacultyAssignedSubjects = async (facultyId) => {
  const [rows] = await pool.execute(
    `SELECT
       f.faculty_id AS facultyId,
       f.full_name AS fullName,
       u.email,
       sub.id AS subjectId,
       sub.subject_code AS subjectCode,
       sub.name AS subjectName,
       fs.assigned_at AS assignedAt
     FROM faculty f
     INNER JOIN users u ON u.user_id = f.user_id
     LEFT JOIN faculty_subjects fs
       ON fs.faculty_id = f.faculty_id
     LEFT JOIN subjects sub
       ON sub.id = fs.subject_id
     WHERE f.faculty_id = ?
       AND u.role = 'FACULTY'
     ORDER BY sub.subject_code ASC`,
    [facultyId]
  );

  if (rows.length === 0) {
    return null;
  }

  const faculty = {
    facultyId: Number(rows[0].facultyId),
    fullName: rows[0].fullName,
    email: rows[0].email,
    subjects: [],
  };

  for (const row of rows) {
    if (row.subjectId !== null) {
      faculty.subjects.push({
        subjectId: Number(row.subjectId),
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
      });
    }
  }

  faculty.totalSubjects = faculty.subjects.length;

  return faculty;
};


export const disablePortalUser = async ({ accountId, role }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const table = role === 'STUDENT' ? 'students' : 'faculty';
    const idColumn = role === 'STUDENT' ? 'student_id' : 'faculty_id';

    const [rows] = await connection.execute(
      `SELECT
         p.${idColumn} AS accountId,
         p.full_name AS fullName,
         u.user_id AS userId,
         u.email,
         u.status
       FROM ${table} p
       INNER JOIN users u ON u.user_id = p.user_id
       WHERE p.${idColumn} = ?
         AND u.role = ?
       LIMIT 1
       FOR UPDATE`,
      [accountId, role]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }

    const account = rows[0];

    if (account.status === 'DISABLED') {
      await connection.rollback();

      return {
        ...account,
        accountId: Number(account.accountId),
        userId: Number(account.userId),
        role,
        alreadyDisabled: true,
      };
    }

    await connection.execute(
      `UPDATE users
       SET status = 'DISABLED'
       WHERE user_id = ? AND role = ?`,
      [account.userId, role]
    );

    await connection.commit();

    return {
      accountId: Number(account.accountId),
      userId: Number(account.userId),
      fullName: account.fullName,
      email: account.email,
      role,
      alreadyDisabled: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
