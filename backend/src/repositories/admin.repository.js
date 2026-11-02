
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
