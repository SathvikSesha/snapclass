import { pool } from '../src/config/db.js';

async function seed() {
  try {
    // 1. Check or insert User 1 (Student One)
    const [existingU1] = await pool.query('SELECT * FROM users WHERE user_id = 1 OR email = "student@example.com"');
    if (existingU1.length === 0) {
      await pool.query(`
        INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
        VALUES (1, 'student@example.com', '$argon2id$v=19$m=65536,p=4,t=3$dummyhash$dummyhash', 'STUDENT', 'ACTIVE', 1)
      `);
      console.log('Inserted User 1');
    }

    // 2. Check or insert Student 1
    const [existingS1] = await pool.query('SELECT * FROM students WHERE student_id = 1');
    if (existingS1.length === 0) {
      await pool.query(`
        INSERT INTO students (student_id, user_id, full_name)
        VALUES (1, 1, 'Student One')
      `);
      console.log('Inserted Student 1');
    }

    // 3. Check or insert Subject 1 (CS301)
    const [existingSub1] = await pool.query('SELECT * FROM subjects WHERE id = 1 OR subject_code = "CS301"');
    if (existingSub1.length === 0) {
      await pool.query(`
        INSERT INTO subjects (id, subject_code, name, credits, created_by_admin_user_id)
        VALUES (1, 'CS301', 'Database Management Systems', 4, 7)
      `);
      console.log('Inserted Subject 1');
    }

    // 4. Enroll Student 1 into Subject 1
    const [existingEnroll] = await pool.query('SELECT * FROM subject_students WHERE subject_id = 1 AND student_id = 1');
    if (existingEnroll.length === 0) {
      await pool.query(`
        INSERT INTO subject_students (subject_id, student_id)
        VALUES (1, 1)
      `);
      console.log('Enrolled Student 1 into Subject 1');
    }

    // 5. Check or insert User 2 (Faculty One)
    const [existingU2] = await pool.query('SELECT * FROM users WHERE user_id = 2 OR email = "faculty@example.com"');
    if (existingU2.length === 0) {
      await pool.query(`
        INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
        VALUES (2, 'faculty@example.com', '$argon2id$v=19$m=65536,p=4,t=3$dummyhash$dummyhash', 'FACULTY', 'ACTIVE', 1)
      `);
      console.log('Inserted User 2');
    }

    // 6. Check or insert Faculty 1
    const [existingF1] = await pool.query('SELECT * FROM faculty WHERE faculty_id = 1');
    if (existingF1.length === 0) {
      await pool.query(`
        INSERT INTO faculty (faculty_id, user_id, full_name)
        VALUES (1, 2, 'Faculty One')
      `);
      console.log('Inserted Faculty 1');
    }

    console.log('Seed completed successfully!');
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await pool.end();
  }
}

seed();

