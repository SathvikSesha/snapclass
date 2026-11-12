import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const API_BASE = 'http://localhost:5000/api/student';

async function deleteQuizById(quizId) {
  if (!quizId) return;
  await pool.execute(
    `DELETE qaa FROM quiz_attempt_answers qaa
     JOIN quiz_attempts qa ON qa.attempt_id = qaa.attempt_id
     WHERE qa.quiz_id = ?`,
    [quizId]
  );
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

async function putAnswer(headers, attemptId, body) {
  const res = await fetch(`${API_BASE}/quiz-attempts/${attemptId}/answers`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('====================================================');
  console.log('       STUDENT QUIZ SAVE ANSWER TEST SUITE          ');
  console.log('====================================================\n');

  const tokenA = generateAccessToken({ user_id: 5, role: 'STUDENT' }); // student_id = 2, enrolled in 33
  const tokenB = generateAccessToken({ user_id: 1, role: 'STUDENT' }); // student_id = 1

  const headersA = { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' };
  const headersB = { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' };

  const cleanupQuizIds = [];
  const now = Date.now();
  const past2h = toMySQLUtc(new Date(now - 2 * 3600 * 1000));
  const past1h = toMySQLUtc(new Date(now - 1 * 3600 * 1000));
  const future1d = toMySQLUtc(new Date(now + 24 * 3600 * 1000));

  try {
    // Setup Quiz 1 (enrolled subject 33) with 2 questions
    const [rQ1] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Save Answer Quiz 1', 'PUBLISHED', 'MEDIUM', 30, 3, 2, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quiz1Id = rQ1.insertId;
    cleanupQuizIds.push(quiz1Id);

    const [rQues1] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, difficulty, marks, question_order)
       VALUES (?, 'Question 1', 'MCQ', 'EASY', 1, 1)`,
      [quiz1Id]
    );
    const q1Id = rQues1.insertId;
    const [rQ1O1] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "Q1 Opt 1", 1, 1)', [q1Id]);
    const [rQ1O2] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "Q1 Opt 2", 2, 0)', [q1Id]);
    const q1Opt1 = rQ1O1.insertId;
    const q1Opt2 = rQ1O2.insertId;

    const [rQues2] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, difficulty, marks, question_order)
       VALUES (?, 'Question 2', 'TRUE_FALSE', 'EASY', 1, 2)`,
      [quiz1Id]
    );
    const q2Id = rQues2.insertId;
    const [rQ2O1] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "True", 1, 1)', [q2Id]);
    await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "False", 2, 0)', [q2Id]);
    const q2Opt1 = rQ2O1.insertId;

    // Setup Quiz 2 with 1 question (to test question from another quiz + expired/submitted attempts)
    const [rQ2] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Save Answer Quiz 2', 'PUBLISHED', 'EASY', 30, 5, 1, ?, ?, ?)`,
      [past2h, future1d, past2h]
    );
    const quiz2Id = rQ2.insertId;
    cleanupQuizIds.push(quiz2Id);
    const [rOtherQ] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, difficulty, marks, question_order)
       VALUES (?, 'Other Quiz Q', 'TRUE_FALSE', 'EASY', 1, 1)`,
      [quiz2Id]
    );
    const otherQuizQId = rOtherQ.insertId;

    // Start active attempt for Student A on Quiz 1
    const startRes = await fetch(`${API_BASE}/quizzes/${quiz1Id}/attempts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const startData = await startRes.json();
    if (startRes.status !== 201) throw new Error(`Start attempt failed: ${JSON.stringify(startData)}`);
    const attemptId = startData.data.attemptId;

    // Create expired & submitted attempts on Quiz 2 for Student A
    const [rExpAtt] = await pool.execute(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number, status, started_at, expires_at, total_marks)
       VALUES (?, 2, 1, 'IN_PROGRESS', ?, ?, 1.00)`,
      [quiz2Id, past2h, past1h]
    );
    const expiredAttemptId = rExpAtt.insertId;

    const [rSubAtt] = await pool.execute(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number, status, started_at, expires_at, submitted_at, score, total_marks)
       VALUES (?, 2, 2, 'SUBMITTED', ?, ?, ?, 1.00, 1.00)`,
      [quiz2Id, past2h, future1d, past1h]
    );
    const submittedAttemptId = rSubAtt.insertId;

    // 1. Valid answer -> 200
    console.log(`--- CASE 1: Valid answer (attemptId=${attemptId}, q1=${q1Id}, opt=${q1Opt1}) -> 200 ---`);
    const c1 = await putAnswer(headersA, attemptId, { questionId: q1Id, selectedOptionId: q1Opt1 });
    console.log(`Status: ${c1.status}`, c1.data);
    if (c1.status !== 200 || c1.data.data.selectedOptionId !== q1Opt1) {
      throw new Error(`Case 1 mismatch: ${JSON.stringify(c1)}`);
    }
    console.log('>>> CASE 1 PASSED <<<\n');

    // 2. Change an existing answer -> 200, updated selection
    console.log(`--- CASE 2: Change existing answer (opt=${q1Opt2}) -> 200 ---`);
    const c2 = await putAnswer(headersA, attemptId, { questionId: q1Id, selectedOptionId: q1Opt2 });
    console.log(`Status: ${c2.status}`, c2.data);
    if (c2.status !== 200 || c2.data.data.selectedOptionId !== q1Opt2) {
      throw new Error(`Case 2 mismatch: ${JSON.stringify(c2)}`);
    }
    console.log('>>> CASE 2 PASSED <<<\n');

    // 3. Clear an answer -> 200, selection becomes NULL
    console.log('--- CASE 3: Clear answer (selectedOptionId=null) -> 200 ---');
    const c3 = await putAnswer(headersA, attemptId, { questionId: q1Id, selectedOptionId: null });
    console.log(`Status: ${c3.status}`, c3.data);
    if (c3.status !== 200 || c3.data.data.selectedOptionId !== null || c3.data.data.answeredAt !== null) {
      throw new Error(`Case 3 mismatch: ${JSON.stringify(c3)}`);
    }

    // Also save q2 answer so we can verify both rows in DB
    await putAnswer(headersA, attemptId, { questionId: q2Id, selectedOptionId: q2Opt1 });

    const [dbRows] = await pool.execute(
      'SELECT answer_id, attempt_id, question_id, selected_option_id, is_correct, marks_awarded, answered_at FROM quiz_attempt_answers WHERE attempt_id = ? ORDER BY question_id',
      [attemptId]
    );
    console.log('DB quiz_attempt_answers rows:', dbRows);
    if (
      dbRows.length !== 2 ||
      dbRows[0].question_id !== q1Id ||
      dbRows[0].selected_option_id !== null ||
      dbRows[0].is_correct !== null ||
      Number(dbRows[0].marks_awarded) !== 0 ||
      dbRows[1].question_id !== q2Id ||
      dbRows[1].selected_option_id !== q2Opt1 ||
      dbRows[1].is_correct !== null ||
      Number(dbRows[1].marks_awarded) !== 0
    ) {
      throw new Error(`DB verification failed: ${JSON.stringify(dbRows)}`);
    }
    console.log('>>> CASE 3 & DB VERIFICATION PASSED <<<\n');

    // 4. Another student's attempt -> 404
    console.log('--- CASE 4: Another student attempt -> 404 ---');
    const c4 = await putAnswer(headersB, attemptId, { questionId: q1Id, selectedOptionId: q1Opt1 });
    console.log(`Status: ${c4.status}`, c4.data);
    if (c4.status !== 404) throw new Error(`Case 4 expected 404, got ${c4.status}`);
    console.log('>>> CASE 4 PASSED (404) <<<\n');

    // 5. Invalid attempt ID -> 400
    console.log('--- CASE 5: Invalid attempt ID ("abc") -> 400 ---');
    const c5 = await putAnswer(headersA, 'abc', { questionId: q1Id, selectedOptionId: q1Opt1 });
    console.log(`Status: ${c5.status}`, c5.data);
    if (c5.status !== 400) throw new Error(`Case 5 expected 400, got ${c5.status}`);
    console.log('>>> CASE 5 PASSED (400) <<<\n');

    // 6. Question from another quiz -> 400
    console.log(`--- CASE 6: Question from another quiz (${otherQuizQId}) -> 400 ---`);
    const c6 = await putAnswer(headersA, attemptId, { questionId: otherQuizQId, selectedOptionId: null });
    console.log(`Status: ${c6.status}`, c6.data);
    if (c6.status !== 400) throw new Error(`Case 6 expected 400, got ${c6.status}`);
    console.log('>>> CASE 6 PASSED (400) <<<\n');

    // 7. Option from another question -> 400
    console.log(`--- CASE 7: Option (${q2Opt1}) from another question submitted for q1 (${q1Id}) -> 400 ---`);
    const c7 = await putAnswer(headersA, attemptId, { questionId: q1Id, selectedOptionId: q2Opt1 });
    console.log(`Status: ${c7.status}`, c7.data);
    if (c7.status !== 400) throw new Error(`Case 7 expected 400, got ${c7.status}`);
    console.log('>>> CASE 7 PASSED (400) <<<\n');

    // 8. Expired attempt -> 409
    console.log(`--- CASE 8: Expired attempt (${expiredAttemptId}) -> 409 ---`);
    const c8 = await putAnswer(headersA, expiredAttemptId, { questionId: otherQuizQId, selectedOptionId: null });
    console.log(`Status: ${c8.status}`, c8.data);
    if (c8.status !== 409) throw new Error(`Case 8 expected 409, got ${c8.status}`);
    console.log('>>> CASE 8 PASSED (409) <<<\n');

    // 9. Already submitted attempt -> 409
    console.log(`--- CASE 9: Already submitted attempt (${submittedAttemptId}) -> 409 ---`);
    const c9 = await putAnswer(headersA, submittedAttemptId, { questionId: otherQuizQId, selectedOptionId: null });
    console.log(`Status: ${c9.status}`, c9.data);
    if (c9.status !== 409) throw new Error(`Case 9 expected 409, got ${c9.status}`);
    console.log('>>> CASE 9 PASSED (409) <<<\n');

    console.log('ALL SAVE ANSWER CASES PASSED SUCCESSFULLY!');
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

