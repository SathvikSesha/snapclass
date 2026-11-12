import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const API_BASE = 'http://localhost:5000/api/faculty';

async function main() {
  console.log('====================================================');
  console.log('       FACULTY QUIZ GENERATION API TEST SUITE       ');
  console.log('====================================================\n');

  const facultyToken = generateAccessToken({ user_id: 6, role: 'FACULTY' });
  const headers = {
    Authorization: `Bearer ${facultyToken}`,
    'Content-Type': 'application/json',
  };

  // Setup temporary test rows in MySQL for Case 3 & Case 4
  const [resOther] = await pool.execute(
    `INSERT INTO subject_materials
     (subject_id, uploaded_by_faculty_id, title, original_filename, object_key, file_type, file_size, status, ingestion_status)
     VALUES (33, 2, 'Temp Other Subject Doc', 'temp.pdf', 'temp/other.pdf', 'application/pdf', 1000, 'AVAILABLE', 'COMPLETED')`
  );
  const otherSubMaterialId = resOther.insertId;

  const [resProc] = await pool.execute(
    `INSERT INTO subject_materials
     (subject_id, uploaded_by_faculty_id, title, original_filename, object_key, file_type, file_size, status, ingestion_status)
     VALUES (5, 2, 'Temp Processing Doc', 'proc.pdf', 'temp/proc.pdf', 'application/pdf', 1000, 'AVAILABLE', 'PROCESSING')`
  );
  const procMaterialId = resProc.insertId;

  const [resFail] = await pool.execute(
    `INSERT INTO subject_materials
     (subject_id, uploaded_by_faculty_id, title, original_filename, object_key, file_type, file_size, status, ingestion_status)
     VALUES (5, 2, 'Temp Failed Doc', 'fail.pdf', 'temp/fail.pdf', 'application/pdf', 1000, 'AVAILABLE', 'FAILED')`
  );
  const failMaterialId = resFail.insertId;

  try {
    // --------------------------------------------------------
    // TEST 2: Faculty not assigned to subject -> 403
    // --------------------------------------------------------
    console.log('--- CASE 2: Faculty not assigned to subject (subject 35) ---');
    const r2 = await fetch(`${API_BASE}/subjects/35/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [7], numberOfQuestions: 2, difficulty: 'medium' }),
    });
    const d2 = await r2.json();
    console.log(`Status: ${r2.status}`, d2);
    if (r2.status !== 403) throw new Error(`Expected 403, got ${r2.status}`);
    console.log('>>> CASE 2 PASSED (403) <<<\n');

    // --------------------------------------------------------
    // TEST 3: Material belonging to another subject -> 400
    // --------------------------------------------------------
    console.log(`--- CASE 3: Material belonging to another subject (doc ${otherSubMaterialId} on subject 5) ---`);
    const r3 = await fetch(`${API_BASE}/subjects/5/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [otherSubMaterialId], numberOfQuestions: 2, difficulty: 'medium' }),
    });
    const d3 = await r3.json();
    console.log(`Status: ${r3.status}`, d3);
    if (r3.status !== 400) throw new Error(`Expected 400, got ${r3.status}`);
    console.log('>>> CASE 3 PASSED (400) <<<\n');

    // --------------------------------------------------------
    // TEST 4: Material with PROCESSING or FAILED status -> 400
    // --------------------------------------------------------
    console.log(`--- CASE 4a: Material with PROCESSING status (doc ${procMaterialId}) ---`);
    const r4a = await fetch(`${API_BASE}/subjects/5/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [procMaterialId], numberOfQuestions: 2, difficulty: 'medium' }),
    });
    const d4a = await r4a.json();
    console.log(`Status: ${r4a.status}`, d4a);
    if (r4a.status !== 400) throw new Error(`Expected 400, got ${r4a.status}`);

    console.log(`--- CASE 4b: Material with FAILED status (doc ${failMaterialId}) ---`);
    const r4b = await fetch(`${API_BASE}/subjects/5/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [failMaterialId], numberOfQuestions: 2, difficulty: 'medium' }),
    });
    const d4b = await r4b.json();
    console.log(`Status: ${r4b.status}`, d4b);
    if (r4b.status !== 400) throw new Error(`Expected 400, got ${r4b.status}`);
    console.log('>>> CASE 4 PASSED (400) <<<\n');

    // --------------------------------------------------------
    // TEST 5: Invalid difficulty or question count -> 400
    // --------------------------------------------------------
    console.log('--- CASE 5a: Invalid difficulty ("extreme") ---');
    const r5a = await fetch(`${API_BASE}/subjects/5/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [7], numberOfQuestions: 2, difficulty: 'extreme' }),
    });
    const d5a = await r5a.json();
    console.log(`Status: ${r5a.status}`, d5a);
    if (r5a.status !== 400) throw new Error(`Expected 400, got ${r5a.status}`);

    console.log('--- CASE 5b: Invalid question count (25) ---');
    const r5b = await fetch(`${API_BASE}/subjects/5/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [7], numberOfQuestions: 25, difficulty: 'medium' }),
    });
    const d5b = await r5b.json();
    console.log(`Status: ${r5b.status}`, d5b);
    if (r5b.status !== 400) throw new Error(`Expected 400, got ${r5b.status}`);
    console.log('>>> CASE 5 PASSED (400) <<<\n');

    // --------------------------------------------------------
    // TEST 1: Valid subject, faculty & indexed document -> 200
    // --------------------------------------------------------
    console.log('--- CASE 1: Valid quiz generation (subject 5, document [7], 2 medium questions) ---');
    const t0 = Date.now();
    const r1 = await fetch(`${API_BASE}/subjects/5/quizzes/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [7], numberOfQuestions: 2, difficulty: 'medium' }),
    });
    const d1 = await r1.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`Status: ${r1.status} (took ${elapsed}s)`);
    console.log('Response:', JSON.stringify(d1, null, 2));

    if (r1.status !== 200 || !d1.success || d1.data?.questions?.length !== 2) {
      throw new Error(`Case 1 failed: expected 200 and 2 questions, got ${r1.status}`);
    }
    console.log('>>> CASE 1 PASSED (200 OK) <<<\n');

  } finally {
    // Cleanup temporary test rows
    await pool.execute('DELETE FROM subject_materials WHERE material_id IN (?, ?, ?)', [
      otherSubMaterialId,
      procMaterialId,
      failMaterialId,
    ]);
  }

  console.log('ALL CASES 1-5 COMPLETED SUCCESSFULLY!');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});

