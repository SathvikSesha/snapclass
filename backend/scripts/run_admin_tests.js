import { generateAccessToken } from '../src/utils/token.js';

async function runTests() {
  const adminToken = generateAccessToken({ user_id: 7, role: 'ADMIN' });
  const studentToken = generateAccessToken({ user_id: 1, role: 'STUDENT' });

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };

  const studentHeaders = {
    Authorization: `Bearer ${studentToken}`,
    'Content-Type': 'application/json',
  };

  console.log('--- RUNNING ADMIN API TESTS ---\n');

  // Test 1: GET /api/admin/students
  console.log('=== TEST 1: GET http://localhost:5000/api/admin/students ===');
  const res1 = await fetch('http://localhost:5000/api/admin/students', {
    headers: adminHeaders,
  });
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}`);
  console.log(JSON.stringify(data1, null, 2));
  console.log('\n');

  // Test 2: GET /api/admin/students/1/subjects
  console.log('=== TEST 2: GET http://localhost:5000/api/admin/students/1/subjects ===');
  const res2 = await fetch('http://localhost:5000/api/admin/students/1/subjects', {
    headers: adminHeaders,
  });
  const data2 = await res2.json();
  console.log(`Status: ${res2.status}`);
  console.log(JSON.stringify(data2, null, 2));
  console.log('\n');

  // Test 3: GET /api/admin/faculty
  console.log('=== TEST 3: GET http://localhost:5000/api/admin/faculty ===');
  const res3 = await fetch('http://localhost:5000/api/admin/faculty', {
    headers: adminHeaders,
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}`);
  console.log(JSON.stringify(data3, null, 2));
  console.log('\n');

  // Test 4: GET /api/admin/faculty/1/subjects
  console.log('=== TEST 4: GET http://localhost:5000/api/admin/faculty/1/subjects ===');
  const res4 = await fetch('http://localhost:5000/api/admin/faculty/1/subjects', {
    headers: adminHeaders,
  });
  const data4 = await res4.json();
  console.log(`Status: ${res4.status}`);
  console.log(JSON.stringify(data4, null, 2));
  console.log('\n');

  // Edge cases
  console.log('=== EDGE CASE: Nonexistent student 99999 ===');
  const res5 = await fetch('http://localhost:5000/api/admin/students/99999/subjects', {
    headers: adminHeaders,
  });
  console.log(`Status: ${res5.status}`, await res5.json());

  console.log('=== EDGE CASE: Nonexistent faculty 99999 ===');
  const res6 = await fetch('http://localhost:5000/api/admin/faculty/99999/subjects', {
    headers: adminHeaders,
  });
  console.log(`Status: ${res6.status}`, await res6.json());

  console.log('=== EDGE CASE: Student accessing admin endpoint ===');
  const res7 = await fetch('http://localhost:5000/api/admin/students', {
    headers: studentHeaders,
  });
  console.log(`Status: ${res7.status}`, await res7.json());

  console.log('=== EDGE CASE: No auth token ===');
  const res8 = await fetch('http://localhost:5000/api/admin/students');
  console.log(`Status: ${res8.status}`, await res8.json());
}

runTests().catch(console.error);

