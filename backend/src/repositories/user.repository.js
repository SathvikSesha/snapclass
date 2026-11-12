import { pool } from '../config/db.js';

export async function findUserByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT user_id, email, role, status, email_verified
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

export async function markEmailVerified(userId) {
  const [result] = await pool.execute(
    `UPDATE users
     SET email_verified = TRUE
     WHERE user_id = ? AND email_verified = FALSE`,
    [userId]
  );

  return result.affectedRows;
}

export async function findUserForAuthentication(email) {
  const [rows] = await pool.execute(
    `SELECT user_id, email, password_hash, role, status, email_verified
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}


export async function findUserById(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, email, role, status, email_verified
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
}
