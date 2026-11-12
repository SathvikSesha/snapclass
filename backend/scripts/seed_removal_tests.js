import { pool } from '../src/config/db.js';
import { createRefreshSession } from '../src/services/session.service.js';
import { generateRefreshToken } from '../src/utils/token.js';

async function seed() {
  console.log('Seeding removal test fixtures...');

  // Update conflicting user emails if any
  await pool.query("UPDATE users SET email = 'student_seed@snapclass.test' WHERE email = 'student@example.com' AND user_id != 12");
  await pool.query("UPDATE users SET email = 'faculty_seed@snapclass.test' WHERE email = 'faculty@example.com' AND user_id != 15");

  // Clean existing 12 and 15 if already present
  await pool.query('DELETE FROM users WHERE user_id IN (12, 15)');

  // 1. Create User 12 & Student 12
  await pool.query(`
    INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
    VALUES (12, 'student@example.com', '$argon2id$v=19$m=65536,p=4,t=3$dummyhash$dummyhash', 'STUDENT', 'ACTIVE', 1)
  `);

  await pool.query(`
    INSERT INTO students (student_id, user_id, full_name)
    VALUES (12, 12, 'Example Student')
  `);

  // Enroll Student 12 in subject 33
  await pool.query(`
    INSERT INTO subject_students (subject_id, student_id)
    VALUES (33, 12)
    ON DUPLICATE KEY UPDATE student_id = student_id
  `);

  // Create active Redis session for Student 12
  await createRefreshSession({
    userId: 12,
    role: 'STUDENT',
    refreshToken: generateRefreshToken(),
  });

  // 2. Create User 15 & Faculty 5
  await pool.query(`
    INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
    VALUES (15, 'faculty@example.com', '$argon2id$v=19$m=65536,p=4,t=3$dummyhash$dummyhash', 'FACULTY', 'ACTIVE', 1)
  `);

  await pool.query(`
    INSERT INTO faculty (faculty_id, user_id, full_name)
    VALUES (5, 15, 'Example Faculty')
  `);

  // Assign Subject 33 to Faculty 5
  await pool.query(`
    INSERT INTO faculty_subjects (subject_id, faculty_id)
    VALUES (33, 5)
    ON DUPLICATE KEY UPDATE faculty_id = faculty_id
  `);

  // Create an Attendance Session by Faculty 5
  const [sessResult] = await pool.query(`
    INSERT INTO attendance_sessions (subject_id, attendance_date, created_by_faculty_id)
    VALUES (33, '2026-11-04', 5)
  `);

  // Create an Attendance Record for Student 12
  await pool.query(`
    INSERT INTO attendance_records (session_id, student_id, status, marked_by)
    VALUES (?, 12, 'PRESENT', 'FACULTY')
  `, [sessResult.insertId]);

  // Create active Redis session for Faculty 5
  await createRefreshSession({
    userId: 15,
    role: 'FACULTY',
    refreshToken: generateRefreshToken(),
  });

  console.log('Seeded Student 12 and Faculty 5 with subjects, attendance, and active sessions!');
  await pool.end();
}

seed().catch(console.error);

