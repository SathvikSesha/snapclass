import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const API_BASE = 'http://localhost:5000/api/student';

async function deleteQuizById(quizId) {
  if (!quizId) return;
  await pool.execute('DELETE FROM quiz_attempts WHERE quiz_id = ?', [quizId]);
  await pool.execute(
    `DELETE qo FROM quiz_question_options qo
     JOIN quiz_questions q ON q.question_id = qo.question_id
     WHERE q.quiz_id = ?`,
    [quizId]
  );
  await pool.execute('DELETE FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  await pool.execute('DELETE FROM quizzes WHERE quiz_id = ?', [quizId]);
}

function toMySQLUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  console.log('====================================================');
  console.log('        STUDENT QUIZ LIST & DETAILS TEST SUITE      ');
  console.log('====================================================\n');

  // student_id=2 (user_id=5, ACTIVE) is enrolled in subject_id=33, NOT subject_id=1
  const studentToken = generateAccessToken({ user_id: 5, role: 'STUDENT' });
  const headers = {
    Authorization: `Bearer ${studentToken}`,
    'Content-Type': 'application/json',
  };

  const cleanupQuizIds = [];
  const now = Date.now();
  const past2d = toMySQLUtc(new Date(now - 48 * 3600 * 1000));
  const past1h = toMySQLUtc(new Date(now - 1 * 3600 * 1000));
  const future1d = toMySQLUtc(new Date(now + 24 * 3600 * 1000));
  const future2d = toMySQLUtc(new Date(now + 48 * 3600 * 1000));

  try {
    // 1. Active AVAILABLE quiz in enrolled subject 33
    const [resAvail] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Student Active Quiz', 'Currently active', 'PUBLISHED', 'MEDIUM', 30, 3, 3, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizAvailableId = resAvail.insertId;
    cleanupQuizIds.push(quizAvailableId);

    // Insert questions out of order (order 2 first, order 1 second) to verify ORDER BY
    const [resQ2] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, explanation, difficulty, marks, question_order)
       VALUES (?, 'Second Question?', 'TRUE_FALSE', 'Secret explanation 2', 'EASY', 1, 2)`,
      [quizAvailableId]
    );
    const [resQ1] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, explanation, difficulty, marks, question_order)
       VALUES (?, 'First Question?', 'MCQ', 'Secret explanation 1', 'MEDIUM', 2, 1)`,
      [quizAvailableId]
    );
    // Insert options out of order to verify option_order sorting
    await pool.execute(
      `INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct)
       VALUES (?, 'Opt 3', 3, 0), (?, 'Opt 1', 1, 1), (?, 'Opt 2', 2, 0)`,
      [resQ1.insertId, resQ1.insertId, resQ1.insertId]
    );
    await pool.execute(
      `INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct)
       VALUES (?, 'False', 2, 0), (?, 'True', 1, 1)`,
      [resQ2.insertId, resQ2.insertId]
    );

    // Insert 2 attempts for student_id=2 on quizAvailableId
    await pool.execute(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number, status, started_at, expires_at, submitted_at, score, total_marks)
       VALUES
       (?, 2, 1, 'SUBMITTED', ?, ?, ?, 2.00, 3.00),
       (?, 2, 2, 'EXPIRED', ?, ?, NULL, 0.00, 3.00)`,
      [quizAvailableId, past1h, future1d, past1h, quizAvailableId, past1h, past1h]
    );

    // 2. UPCOMING quiz in enrolled subject 33
    const [resUpc] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Student Upcoming Quiz', 'PUBLISHED', 'EASY', 20, 1, 2, ?, ?, ?)`,
      [future1d, future2d, past1h]
    );
    const quizUpcomingId = resUpc.insertId;
    cleanupQuizIds.push(quizUpcomingId);

    // 3. CLOSED quiz in enrolled subject 33
    const [resClosed] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at, closed_at)
       VALUES (33, 2, 'Student Closed Quiz', 'CLOSED', 'HARD', 45, 1, 5, ?, ?, ?, ?)`,
      [past2d, future1d, past2d, past1h]
    );
    const quizClosedId = resClosed.insertId;
    cleanupQuizIds.push(quizClosedId);

    // 4. ENDED (expired deadline) quiz in enrolled subject 33
    const [resEnded] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Student Expired Quiz', 'PUBLISHED', 'MEDIUM', 30, 1, 4, ?, ?, ?)`,
      [past2d, past1h, past2d]
    );
    const quizEndedId = resEnded.insertId;
    cleanupQuizIds.push(quizEndedId);

    // 5. DRAFT quiz in enrolled subject 33 (must be hidden)
    const [resDraft] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, total_marks)
       VALUES (33, 2, 'Student Hidden Draft Quiz', 'DRAFT', 'EASY', 2)`
    );
    const quizDraftId = resDraft.insertId;
    cleanupQuizIds.push(quizDraftId);

    // 6. PUBLISHED quiz in UNENROLLED subject 1 (must be hidden / 404)
    const [resOtherSub] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (1, 1, 'Unenrolled Subject Quiz', 'PUBLISHED', 'MEDIUM', 30, 1, 5, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizOtherSubId = resOtherSub.insertId;
    cleanupQuizIds.push(quizOtherSubId);

    // ========================================================
    // TEST 1: GET /api/student/quizzes
    // ========================================================
    console.log('--- TEST 1: GET /api/student/quizzes ---');
    const r1 = await fetch(`${API_BASE}/quizzes`, { headers });
    const d1 = await r1.json();
    console.log(`Status: ${r1.status}`);
    if (r1.status !== 200 || !d1.success || !Array.isArray(d1.data)) {
      throw new Error(`Test 1 unexpected response: ${r1.status} ${JSON.stringify(d1)}`);
    }

    const byId = new Map(d1.data.map(q => [q.quizId, q]));
    console.log('Returned quizzes:', d1.data.map(q => ({
      quizId: q.quizId,
      title: q.title,
      status: q.status,
      availabilityStatus: q.availabilityStatus,
      attemptsUsed: q.attemptsUsed,
      totalQuestions: q.totalQuestions,
    })));

    if (byId.has(quizDraftId)) throw new Error('Draft quiz leaked into student list');
    if (byId.has(quizOtherSubId)) throw new Error('Unenrolled subject quiz leaked into student list');

    if (byId.get(quizAvailableId)?.availabilityStatus !== 'AVAILABLE') {
      throw new Error(`Expected AVAILABLE, got ${byId.get(quizAvailableId)?.availabilityStatus}`);
    }
    if (byId.get(quizAvailableId)?.attemptsUsed !== 2) {
      throw new Error(`Expected attemptsUsed=2, got ${byId.get(quizAvailableId)?.attemptsUsed}`);
    }
    if (byId.get(quizUpcomingId)?.availabilityStatus !== 'UPCOMING') {
      throw new Error(`Expected UPCOMING, got ${byId.get(quizUpcomingId)?.availabilityStatus}`);
    }
    if (byId.get(quizClosedId)?.availabilityStatus !== 'CLOSED') {
      throw new Error(`Expected CLOSED, got ${byId.get(quizClosedId)?.availabilityStatus}`);
    }
    if (byId.get(quizEndedId)?.availabilityStatus !== 'ENDED') {
      throw new Error(`Expected ENDED, got ${byId.get(quizEndedId)?.availabilityStatus}`);
    }
    console.log('>>> TEST 1 PASSED <<<\n');

    // ========================================================
    // TEST 2: GET /api/student/quizzes/:quizId
    // ========================================================
    console.log(`--- TEST 2a: GET /api/student/quizzes/${quizAvailableId} (enrolled, published) ---`);
    const r2a = await fetch(`${API_BASE}/quizzes/${quizAvailableId}`, { headers });
    const d2a = await r2a.json();
    console.log(`Status: ${r2a.status}`, JSON.stringify(d2a, null, 2));
    if (r2a.status !== 200 || !d2a.success) {
      throw new Error(`Test 2a expected 200, got ${r2a.status}`);
    }
    const qs = d2a.data.questions;
    if (qs.length !== 2 || qs[0].questionOrder !== 1 || qs[1].questionOrder !== 2) {
      throw new Error(`Questions order mismatch: ${JSON.stringify(qs)}`);
    }
    if (
      qs[0].options.map(o => o.optionOrder).join(',') !== '1,2,3' ||
      qs[1].options.map(o => o.optionOrder).join(',') !== '1,2'
    ) {
      throw new Error(`Options order mismatch: ${JSON.stringify(qs)}`);
    }
    for (const q of qs) {
      if ('explanation' in q) throw new Error('explanation must NOT be returned to student');
      for (const opt of q.options) {
        if ('isCorrect' in opt || 'is_correct' in opt) {
          throw new Error('Correct answer flag must NOT be returned to student');
        }
      }
    }
    console.log('>>> TEST 2a PASSED (order verified, no answers/explanations leaked) <<<\n');

    console.log(`--- TEST 2b: GET /api/student/quizzes/${quizOtherSubId} (unenrolled subject -> 404) ---`);
    const r2b = await fetch(`${API_BASE}/quizzes/${quizOtherSubId}`, { headers });
    const d2b = await r2b.json();
    console.log(`Status: ${r2b.status}`, d2b);
    if (r2b.status !== 404) throw new Error(`Test 2b expected 404, got ${r2b.status}`);
    console.log('>>> TEST 2b PASSED (404) <<<\n');

    console.log(`--- TEST 2c: GET /api/student/quizzes/${quizDraftId} (draft quiz -> 404) ---`);
    const r2c = await fetch(`${API_BASE}/quizzes/${quizDraftId}`, { headers });
    const d2c = await r2c.json();
    console.log(`Status: ${r2c.status}`, d2c);
    if (r2c.status !== 404) throw new Error(`Test 2c expected 404, got ${r2c.status}`);
    console.log('>>> TEST 2c PASSED (404) <<<\n');

    console.log('ALL STUDENT QUIZ READ TESTS PASSED SUCCESSFULLY!');
  } finally {
    for (const id of cleanupQuizIds) {
      await deleteQuizById(id);
    }
    console.log(`Cleanup: deleted temporary quizzes ${JSON.stringify(cleanupQuizIds)}`);
    await pool.end();
  }
}

main().catch(err => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});

