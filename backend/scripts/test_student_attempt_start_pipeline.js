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

async function startAttempt(headers, quizId) {
  const res = await fetch(`${API_BASE}/quizzes/${quizId}/attempts`, {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('====================================================');
  console.log('      STUDENT QUIZ START ATTEMPT TEST SUITE         ');
  console.log('====================================================\n');

  // student_id=2 (user_id=5, ACTIVE) enrolled in subject_id=33, NOT subject_id=1
  const studentToken = generateAccessToken({ user_id: 5, role: 'STUDENT' });
  const headers = { Authorization: `Bearer ${studentToken}` };

  const cleanupQuizIds = [];
  const now = Date.now();
  const past2d = toMySQLUtc(new Date(now - 48 * 3600 * 1000));
  const past1h = toMySQLUtc(new Date(now - 1 * 3600 * 1000));
  const future5m = toMySQLUtc(new Date(now + 5 * 60 * 1000));
  const future1d = toMySQLUtc(new Date(now + 24 * 3600 * 1000));
  const future2d = toMySQLUtc(new Date(now + 48 * 3600 * 1000));

  try {
    // Quiz 1: Available, duration 30m, deadline +1d, max_attempts=2
    const [rQAvail] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Attempt Start Quiz', 'PUBLISHED', 'MEDIUM', 30, 2, 3, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizAvailId = rQAvail.insertId;
    cleanupQuizIds.push(quizAvailId);

    const [rQues1] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, explanation, difficulty, marks, question_order)
       VALUES (?, 'What is 2+2?', 'MCQ', 'Secret explanation', 'EASY', 3, 1)`,
      [quizAvailId]
    );
    await pool.execute(
      `INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct)
       VALUES (?, '3', 1, 0), (?, '4', 2, 1), (?, '5', 3, 0)`,
      [rQues1.insertId, rQues1.insertId, rQues1.insertId]
    );

    // Quiz 2: Available, duration 60m, deadline +5m (tests LEAST(duration, deadline))
    const [rQCap] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Deadline Cap Quiz', 'PUBLISHED', 'EASY', 60, 1, 1, ?, ?, ?)`,
      [past1h, future5m, past1h]
    );
    const quizCapId = rQCap.insertId;
    cleanupQuizIds.push(quizCapId);

    // Quiz 3: Unenrolled subject 1
    const [rQUnenrolled] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (1, 1, 'Unenrolled Subject Quiz', 'PUBLISHED', 'EASY', 30, 1, 1, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizUnenrolledId = rQUnenrolled.insertId;
    cleanupQuizIds.push(quizUnenrolledId);

    // Quiz 4: Upcoming
    const [rQUpc] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Upcoming Quiz', 'PUBLISHED', 'EASY', 30, 1, 1, ?, ?, ?)`,
      [future1d, future2d, past1h]
    );
    const quizUpcomingId = rQUpc.insertId;
    cleanupQuizIds.push(quizUpcomingId);

    // Quiz 5: Deadline passed
    const [rQPast] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Expired Quiz', 'PUBLISHED', 'EASY', 30, 1, 1, ?, ?, ?)`,
      [past2d, past1h, past2d]
    );
    const quizExpiredId = rQPast.insertId;
    cleanupQuizIds.push(quizExpiredId);

    // Quiz 6: Closed
    const [rQClosed] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at, closed_at)
       VALUES (33, 2, 'Closed Quiz', 'CLOSED', 'EASY', 30, 1, 1, ?, ?, ?, ?)`,
      [past2d, future1d, past2d, past1h]
    );
    const quizClosedId = rQClosed.insertId;
    cleanupQuizIds.push(quizClosedId);

    // Quiz 7: Concurrency test quiz
    const [rQConc] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Concurrency Test Quiz', 'PUBLISHED', 'EASY', 30, 2, 1, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizConcId = rQConc.insertId;
    cleanupQuizIds.push(quizConcId);

    // --------------------------------------------------------
    // 1. Enrolled student, available quiz -> 201 Created
    // --------------------------------------------------------
    console.log(`--- CASE 1: Enrolled student, available quiz (${quizAvailId}) -> 201 ---`);
    const c1 = await startAttempt(headers, quizAvailId);
    console.log(`Status: ${c1.status}`, JSON.stringify(c1.data, null, 2));
    if (c1.status !== 201 || c1.data.data.status !== 'IN_PROGRESS' || c1.data.data.attemptNumber !== 1) {
      throw new Error(`Case 1 mismatch: ${JSON.stringify(c1)}`);
    }
    // Check no answers or explanations leaked
    for (const q of c1.data.data.questions) {
      if ('explanation' in q) throw new Error('Explanation leaked in attempt start');
      for (const o of q.options) {
        if ('isCorrect' in o || 'is_correct' in o) throw new Error('Correct answer leaked in attempt start');
      }
    }
    // Check DB row & duration-based expiry (~30m after started_at)
    const [dbAtt1] = await pool.execute(
      'SELECT status, attempt_number, TIMESTAMPDIFF(MINUTE, started_at, expires_at) AS diffMin FROM quiz_attempts WHERE attempt_id = ?',
      [c1.data.data.attemptId]
    );
    console.log('DB attempt 1:', dbAtt1[0]);
    if (dbAtt1[0].status !== 'IN_PROGRESS' || dbAtt1[0].attempt_number !== 1 || dbAtt1[0].diffMin !== 30) {
      throw new Error(`DB attempt 1 mismatch: ${JSON.stringify(dbAtt1[0])}`);
    }
    console.log('>>> CASE 1 PASSED <<<\n');

    // --------------------------------------------------------
    // 1b. Verify expires_at is capped by deadline_at when deadline < duration
    // --------------------------------------------------------
    console.log(`--- CASE 1b: Deadline cap check (duration=60m, deadline=+5m, quizId=${quizCapId}) ---`);
    const c1b = await startAttempt(headers, quizCapId);
    if (c1b.status !== 201) throw new Error(`Case 1b expected 201, got ${c1b.status}`);
    const [dbCap] = await pool.execute(
      'SELECT expires_at = (SELECT deadline_at FROM quizzes WHERE quiz_id = ?) AS cappedAtDeadline FROM quiz_attempts WHERE attempt_id = ?',
      [quizCapId, c1b.data.data.attemptId]
    );
    console.log('DB cappedAtDeadline:', dbCap[0]);
    if (dbCap[0].cappedAtDeadline !== 1) {
      throw new Error('Expected expires_at to equal quiz deadline_at');
    }
    console.log('>>> CASE 1b PASSED (expires_at capped at earlier deadline) <<<\n');

    // --------------------------------------------------------
    // 2. Student already has an active attempt -> 409 Conflict
    // --------------------------------------------------------
    console.log(`--- CASE 2: Already has active attempt (${quizAvailId}) -> 409 ---`);
    const c2 = await startAttempt(headers, quizAvailId);
    console.log(`Status: ${c2.status}`, c2.data);
    if (c2.status !== 409) throw new Error(`Case 2 expected 409, got ${c2.status}`);
    console.log('>>> CASE 2 PASSED (409) <<<\n');

    // --------------------------------------------------------
    // 3. Complete attempt 1, start attempt 2 (attemptNumber increments to 2), then reach maxAttempts -> 409
    // --------------------------------------------------------
    await pool.execute("UPDATE quiz_attempts SET status = 'SUBMITTED', submitted_at = UTC_TIMESTAMP() WHERE attempt_id = ?", [c1.data.data.attemptId]);
    console.log(`--- CASE 3a: Start attempt 2 (${quizAvailId}) -> 201, attemptNumber=2 ---`);
    const c3a = await startAttempt(headers, quizAvailId);
    console.log(`Status: ${c3a.status}`, { attemptId: c3a.data.data?.attemptId, attemptNumber: c3a.data.data?.attemptNumber });
    if (c3a.status !== 201 || c3a.data.data.attemptNumber !== 2) {
      throw new Error(`Case 3a expected 201 with attemptNumber=2, got ${c3a.status} ${JSON.stringify(c3a.data)}`);
    }

    await pool.execute("UPDATE quiz_attempts SET status = 'SUBMITTED', submitted_at = UTC_TIMESTAMP() WHERE attempt_id = ?", [c3a.data.data.attemptId]);
    console.log(`--- CASE 3b: Maximum attempts reached (${quizAvailId}) -> 409 ---`);
    const c3b = await startAttempt(headers, quizAvailId);
    console.log(`Status: ${c3b.status}`, c3b.data);
    if (c3b.status !== 409) throw new Error(`Case 3b expected 409, got ${c3b.status}`);
    console.log('>>> CASE 3 PASSED (attempt_number incremented & max attempts enforced) <<<\n');

    // --------------------------------------------------------
    // 4. Student not enrolled -> 403 Forbidden
    // --------------------------------------------------------
    console.log(`--- CASE 4: Student not enrolled (${quizUnenrolledId}) -> 403 ---`);
    const c4 = await startAttempt(headers, quizUnenrolledId);
    console.log(`Status: ${c4.status}`, c4.data);
    if (c4.status !== 403) throw new Error(`Case 4 expected 403, got ${c4.status}`);
    console.log('>>> CASE 4 PASSED (403) <<<\n');

    // --------------------------------------------------------
    // 5. Quiz is still upcoming -> 409 Conflict
    // --------------------------------------------------------
    console.log(`--- CASE 5: Quiz is still upcoming (${quizUpcomingId}) -> 409 ---`);
    const c5 = await startAttempt(headers, quizUpcomingId);
    console.log(`Status: ${c5.status}`, c5.data);
    if (c5.status !== 409) throw new Error(`Case 5 expected 409, got ${c5.status}`);
    console.log('>>> CASE 5 PASSED (409) <<<\n');

    // --------------------------------------------------------
    // 6. Quiz deadline passed -> 409 Conflict
    // --------------------------------------------------------
    console.log(`--- CASE 6: Quiz deadline passed (${quizExpiredId}) -> 409 ---`);
    const c6 = await startAttempt(headers, quizExpiredId);
    console.log(`Status: ${c6.status}`, c6.data);
    if (c6.status !== 409) throw new Error(`Case 6 expected 409, got ${c6.status}`);
    console.log('>>> CASE 6 PASSED (409) <<<\n');

    // --------------------------------------------------------
    // 7. Quiz is closed -> 409 Conflict
    // --------------------------------------------------------
    console.log(`--- CASE 7: Quiz is closed (${quizClosedId}) -> 409 ---`);
    const c7 = await startAttempt(headers, quizClosedId);
    console.log(`Status: ${c7.status}`, c7.data);
    if (c7.status !== 409) throw new Error(`Case 7 expected 409, got ${c7.status}`);
    console.log('>>> CASE 7 PASSED (409) <<<\n');

    // --------------------------------------------------------
    // 8. Invalid quiz ID -> 400 Bad Request
    // --------------------------------------------------------
    console.log('--- CASE 8: Invalid quiz ID ("abc") -> 400 ---');
    const c8 = await startAttempt(headers, 'abc');
    console.log(`Status: ${c8.status}`, c8.data);
    if (c8.status !== 400) throw new Error(`Case 8 expected 400, got ${c8.status}`);
    console.log('>>> CASE 8 PASSED (400) <<<\n');

    // --------------------------------------------------------
    // 9. Two simultaneous start requests cannot create two active attempts
    // --------------------------------------------------------
    console.log(`--- CASE 9: Simultaneous start requests (${quizConcId}) -> one 201, one 409 ---`);
    const [s1, s2] = await Promise.all([
      startAttempt(headers, quizConcId),
      startAttempt(headers, quizConcId),
    ]);
    const statuses = [s1.status, s2.status].sort((a, b) => a - b);
    console.log('Simultaneous statuses:', statuses);
    if (statuses[0] !== 201 || statuses[1] !== 409) {
      throw new Error(`Case 9 expected [201, 409], got ${JSON.stringify(statuses)}`);
    }
    const [[{ cnt }]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM quiz_attempts WHERE quiz_id = ? AND student_id = 2',
      [quizConcId]
    );
    console.log('DB attempt count after simultaneous requests:', cnt);
    if (cnt !== 1) throw new Error(`Expected exactly 1 attempt row, got ${cnt}`);
    console.log('>>> CASE 9 PASSED (row-level lock serialized concurrent starts) <<<\n');

    console.log('ALL START ATTEMPT CASES PASSED SUCCESSFULLY!');
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

