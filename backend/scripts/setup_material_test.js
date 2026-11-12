import { pool } from '../src/config/db.js';

async function setup() {
  await pool.query(`
    INSERT INTO subjects (id, subject_code, name, credits, created_by_admin_user_id)
    VALUES (5, 'CS101', 'Database Management Systems', 4, 7)
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);

  await pool.query(`
    INSERT INTO faculty_subjects (subject_id, faculty_id)
    VALUES (5, 2)
    ON DUPLICATE KEY UPDATE faculty_id = VALUES(faculty_id)
  `);

  console.log('Subject 5 is ready and assigned to Faculty 2 (user_id 6)!');
  await pool.end();
}

setup().catch(console.error);
