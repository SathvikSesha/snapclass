import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

async function runTests() {
  const adminToken = generateAccessToken({ user_id: 7, role: 'ADMIN' });
  const studentToken = generateAccessToken({ user_id: 12, role: 'STUDENT' });

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };

  const studentHeaders = {
    Authorization: `Bearer ${studentToken}`,
    'Content-Type': 'application/json',
  };

  console.log('====================================================');
  console.log('       ADMIN REMOVE ACCOUNT ENDPOINT TESTS          ');
  console.log('====================================================\n');

  // Test A: Remove a student (DELETE /api/admin/students/12)
  console.log('=== TEST A: DELETE http://localhost:5000/api/admin/students/12 ===');
  const resA = await fetch('http://localhost:5000/api/admin/students/12', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  const dataA = await resA.json();
  console.log(`Status: ${resA.status}`);
  console.log(JSON.stringify(dataA, null, 2));
  console.log('\n');

  // Test B: Remove a faculty member (DELETE /api/admin/faculty/5)
  console.log('=== TEST B: DELETE http://localhost:5000/api/admin/faculty/5 ===');
  const resB = await fetch('http://localhost:5000/api/admin/faculty/5', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  const dataB = await resB.json();
  console.log(`Status: ${resB.status}`);
  console.log(JSON.stringify(dataB, null, 2));
  console.log('\n');

  // Additional Tests
  console.log('=== ADDITIONAL TESTS ===\n');

  // 1. Nonexistent student ID
  console.log('--- 1. Nonexistent student ID (99999) ---');
  const resNonStudent = await fetch('http://localhost:5000/api/admin/students/99999', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(`Status: ${resNonStudent.status}`, await resNonStudent.json());

  // 2. Nonexistent faculty ID
  console.log('--- 2. Nonexistent faculty ID (99999) ---');
  const resNonFac = await fetch('http://localhost:5000/api/admin/faculty/99999', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(`Status: ${resNonFac.status}`, await resNonFac.json());

  // 3. Invalid ID
  console.log('--- 3. Invalid ID (abc / -5) ---');
  const resInv = await fetch('http://localhost:5000/api/admin/students/abc', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(`Status (abc): ${resInv.status}`, await resInv.json());
  const resNeg = await fetch('http://localhost:5000/api/admin/faculty/-5', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(`Status (-5): ${resNeg.status}`, await resNeg.json());

  // 4. Already-disabled account
  console.log('--- 4. Already-disabled account (Student 12 again) ---');
  const resAlready = await fetch('http://localhost:5000/api/admin/students/12', {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(`Status: ${resAlready.status}`, await resAlready.json());

  // 5. Request without Admin authentication
  console.log('--- 5a. Request without authentication (No Token) ---');
  const resNoAuth = await fetch('http://localhost:5000/api/admin/students/12', {
    method: 'DELETE',
  });
  console.log(`Status: ${resNoAuth.status}`, await resNoAuth.json());

  console.log('--- 5b. Request with Student authentication (Forbidden) ---');
  const resForbidden = await fetch('http://localhost:5000/api/admin/students/12', {
    method: 'DELETE',
    headers: studentHeaders,
  });
  console.log(`Status: ${resForbidden.status}`, await resForbidden.json());

  // 6. Verify Database records
  console.log('\n=== DATABASE INTEGRITY & HISTORY VERIFICATION ===\n');

  console.log('--- Query Users Table for Student 12 (user_id 12) ---');
  const [user12] = await pool.query('SELECT user_id, email, role, status FROM users WHERE user_id = 12');
  console.log(user12);

  console.log('--- Query Users Table for Faculty 5 (user_id 15) ---');
  const [user15] = await pool.query('SELECT user_id, email, role, status FROM users WHERE user_id = 15');
  console.log(user15);

  console.log('--- Verify Student 12 subject enrollment still exists in DB ---');
  const [subj12] = await pool.query('SELECT * FROM subject_students WHERE student_id = 12');
  console.log(subj12);

  console.log('--- Verify Student 12 attendance record still exists in DB ---');
  const [att12] = await pool.query('SELECT * FROM attendance_records WHERE student_id = 12');
  console.log(att12);

  console.log('--- Verify Faculty 5 assigned subject still exists in DB ---');
  const [facSubj5] = await pool.query('SELECT * FROM faculty_subjects WHERE faculty_id = 5');
  console.log(facSubj5);

  console.log('--- Verify Faculty 5 attendance session still exists in DB ---');
  const [facSess5] = await pool.query('SELECT * FROM attendance_sessions WHERE created_by_faculty_id = 5');
  console.log(facSess5);

  await pool.end();
}

runTests().catch(console.error);

