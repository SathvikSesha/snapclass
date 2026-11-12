import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const API_BASE = 'http://localhost:5000/api/faculty';

async function deleteQuizById(quizId) {
  if (!quizId) return;
  await pool.execute(
    `DELETE qo FROM quiz_question_options qo
     JOIN quiz_questions q ON q.question_id = qo.question_id
     WHERE q.quiz_id = ?`,
    [quizId]
  );
  await pool.execute('DELETE FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  await pool.execute('DELETE FROM quizzes WHERE quiz_id = ?', [quizId]);
}

async function postJson(url, headers, body) {
  const options = { method: 'POST', headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('====================================================');
  console.log('      FACULTY QUIZ PUBLISH & CLOSE TEST SUITE       ');
  console.log('====================================================\n');

  const tokenA = generateAccessToken({ user_id: 6, role: 'FACULTY' }); // faculty_id = 2 (ACTIVE)
  const tokenB = generateAccessToken({ user_id: 2, role: 'FACULTY' }); // faculty_id = 1 (ACTIVE)

  const headersA = { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' };
  const headersB = { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' };
  const headersNoBodyA = { Authorization: `Bearer ${tokenA}` };

  const cleanupQuizIds = [];

  // Use dates safely in the future relative to current time
  const startFuture = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const deadlineFuture = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const validPublishBody = {
    startAt: startFuture,
    deadlineAt: deadlineFuture,
    durationMinutes: 30,
    maxAttempts: 2,
  };

  try {
    // Setup 1: Valid draft quiz (totalMarks = 5)
    const createRes = await postJson(`${API_BASE}/subjects/5/quizzes`, headersA, {
      title: 'Publish Lifecycle Test Quiz',
      description: 'Testing publish and close transitions',
      difficulty: 'medium',
      questions: [
        {
          question: 'Q1 worth 3 marks',
          questionType: 'MCQ',
          options: [
            { text: 'Correct', isCorrect: true },
            { text: 'Wrong 1', isCorrect: false },
            { text: 'Wrong 2', isCorrect: false },
          ],
          difficulty: 'medium',
          marks: 3,
          sourceDocumentId: 7,
        },
        {
          question: 'Q2 worth 2 marks',
          questionType: 'TRUE_FALSE',
          options: [
            { text: 'True', isCorrect: true },
            { text: 'False', isCorrect: false },
          ],
          difficulty: 'easy',
          marks: 2,
          sourceDocumentId: 7,
        },
      ],
    });
    if (createRes.status !== 201) throw new Error(`Setup failed: ${JSON.stringify(createRes)}`);
    const validDraftId = createRes.data.data.quizId;
    cleanupQuizIds.push(validDraftId);

    // Setup 2: Draft quiz with no questions
    const [emptyRes] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, total_marks)
       VALUES (5, 2, 'Empty Draft Quiz', 'DRAFT', 'EASY', 0)`
    );
    const emptyDraftId = emptyRes.insertId;
    cleanupQuizIds.push(emptyDraftId);

    // Setup 3: Draft quiz with a question that has no correct option
    const [noCorrectQuizRes] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, total_marks)
       VALUES (5, 2, 'No Correct Option Draft', 'DRAFT', 'EASY', 2)`
    );
    const noCorrectDraftId = noCorrectQuizRes.insertId;
    cleanupQuizIds.push(noCorrectDraftId);

    const [noCorrectQRes] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, difficulty, marks, question_order)
       VALUES (?, 'Broken question', 'MCQ', 'EASY', 2, 1)`,
      [noCorrectDraftId]
    );
    await pool.execute(
      `INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct)
       VALUES (?, 'Opt A', 1, 0), (?, 'Opt B', 2, 0)`,
      [noCorrectQRes.insertId, noCorrectQRes.insertId]
    );

    // Setup 4: Another draft quiz (stays DRAFT for close-draft rejection & other-faculty rejection)
    const createRes2 = await postJson(`${API_BASE}/subjects/5/quizzes`, headersA, {
      title: 'Secondary Draft Quiz',
      difficulty: 'easy',
      questions: [
        {
          question: 'Simple TF',
          questionType: 'TRUE_FALSE',
          options: [
            { text: 'True', isCorrect: true },
            { text: 'False', isCorrect: false },
          ],
          difficulty: 'easy',
          marks: 1,
        },
      ],
    });
    if (createRes2.status !== 201) throw new Error(`Setup 4 failed: ${JSON.stringify(createRes2)}`);
    const secondaryDraftId = createRes2.data.data.quizId;
    cleanupQuizIds.push(secondaryDraftId);

    // 1. Publish a valid draft
    console.log(`--- CASE 1: Publish a valid draft (quizId=${validDraftId}) ---`);
    const c1 = await postJson(`${API_BASE}/quizzes/${validDraftId}/publish`, headersA, validPublishBody);
    console.log(`Status: ${c1.status}`, c1.data);
    if (
      c1.status !== 200 ||
      c1.data.message !== 'Quiz published successfully' ||
      c1.data.data.quizId !== validDraftId ||
      c1.data.data.status !== 'PUBLISHED' ||
      c1.data.data.totalMarks !== 5
    ) {
      throw new Error(`Case 1 mismatch: ${JSON.stringify(c1)}`);
    }
    const [dbPub] = await pool.execute(
      'SELECT status, duration_minutes, max_attempts, total_marks, published_at FROM quizzes WHERE quiz_id = ?',
      [validDraftId]
    );
    console.log('DB row after publish:', dbPub[0]);
    if (dbPub[0].status !== 'PUBLISHED' || dbPub[0].duration_minutes !== 30 || dbPub[0].max_attempts !== 2) {
      throw new Error('Case 1 DB state mismatch');
    }
    console.log('>>> CASE 1 PASSED <<<\n');

    // 2. Publish the same quiz twice — reject the second request
    console.log(`--- CASE 2: Publish the same quiz twice (quizId=${validDraftId}) ---`);
    const c2 = await postJson(`${API_BASE}/quizzes/${validDraftId}/publish`, headersA, validPublishBody);
    console.log(`Status: ${c2.status}`, c2.data);
    if (c2.status !== 409) throw new Error(`Case 2 expected 409, got ${c2.status}`);
    console.log('>>> CASE 2 PASSED (409) <<<\n');

    // 3. Publish a quiz without questions
    console.log(`--- CASE 3: Publish quiz without questions (quizId=${emptyDraftId}) ---`);
    const c3 = await postJson(`${API_BASE}/quizzes/${emptyDraftId}/publish`, headersA, validPublishBody);
    console.log(`Status: ${c3.status}`, c3.data);
    if (c3.status !== 400) throw new Error(`Case 3 expected 400, got ${c3.status}`);
    console.log('>>> CASE 3 PASSED (400) <<<\n');

    // 4. Publish a question without a correct option
    console.log(`--- CASE 4: Publish question without a correct option (quizId=${noCorrectDraftId}) ---`);
    const c4 = await postJson(`${API_BASE}/quizzes/${noCorrectDraftId}/publish`, headersA, validPublishBody);
    console.log(`Status: ${c4.status}`, c4.data);
    if (c4.status !== 400) throw new Error(`Case 4 expected 400, got ${c4.status}`);
    console.log('>>> CASE 4 PASSED (400) <<<\n');

    // 5. Invalid start time
    console.log('--- CASE 5a: Invalid start time (missing timezone) ---');
    const c5a = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/publish`, headersA, {
      ...validPublishBody,
      startAt: '2026-11-13T09:00:00',
    });
    console.log(`Status: ${c5a.status}`, c5a.data);
    if (c5a.status !== 400) throw new Error(`Case 5a expected 400, got ${c5a.status}`);

    console.log('--- CASE 5b: Invalid start time (in the past) ---');
    const c5b = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/publish`, headersA, {
      ...validPublishBody,
      startAt: '2020-01-01T00:00:00Z',
    });
    console.log(`Status: ${c5b.status}`, c5b.data);
    if (c5b.status !== 400) throw new Error(`Case 5b expected 400, got ${c5b.status}`);
    console.log('>>> CASE 5 PASSED (400) <<<\n');

    // 6. Deadline before start time
    console.log('--- CASE 6: Deadline before start time ---');
    const c6 = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/publish`, headersA, {
      ...validPublishBody,
      startAt: deadlineFuture,
      deadlineAt: startFuture,
    });
    console.log(`Status: ${c6.status}`, c6.data);
    if (c6.status !== 400) throw new Error(`Case 6 expected 400, got ${c6.status}`);
    console.log('>>> CASE 6 PASSED (400) <<<\n');

    // 7. Invalid duration or maximum attempts
    console.log('--- CASE 7a: Invalid duration (0) ---');
    const c7a = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/publish`, headersA, {
      ...validPublishBody,
      durationMinutes: 0,
    });
    console.log(`Status: ${c7a.status}`, c7a.data);
    if (c7a.status !== 400) throw new Error(`Case 7a expected 400, got ${c7a.status}`);

    console.log('--- CASE 7b: Invalid maxAttempts (6) ---');
    const c7b = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/publish`, headersA, {
      ...validPublishBody,
      maxAttempts: 6,
    });
    console.log(`Status: ${c7b.status}`, c7b.data);
    if (c7b.status !== 400) throw new Error(`Case 7b expected 400, got ${c7b.status}`);
    console.log('>>> CASE 7 PASSED (400) <<<\n');

    // 8. Another faculty tries to publish the quiz
    console.log(`--- CASE 8: Another faculty tries to publish quiz (quizId=${secondaryDraftId}) ---`);
    const c8 = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/publish`, headersB, validPublishBody);
    console.log(`Status: ${c8.status}`, c8.data);
    if (c8.status !== 404) throw new Error(`Case 8 expected 404, got ${c8.status}`);
    console.log('>>> CASE 8 PASSED (404) <<<\n');

    // 9. Close a published quiz (no request body)
    console.log(`--- CASE 9: Close published quiz (quizId=${validDraftId}) ---`);
    const c9 = await postJson(`${API_BASE}/quizzes/${validDraftId}/close`, headersNoBodyA);
    console.log(`Status: ${c9.status}`, c9.data);
    if (
      c9.status !== 200 ||
      c9.data.message !== 'Quiz closed successfully' ||
      c9.data.data.quizId !== validDraftId ||
      c9.data.data.status !== 'CLOSED'
    ) {
      throw new Error(`Case 9 mismatch: ${JSON.stringify(c9)}`);
    }
    const [dbClosed] = await pool.execute('SELECT status, closed_at FROM quizzes WHERE quiz_id = ?', [validDraftId]);
    console.log('DB row after close:', dbClosed[0]);
    if (dbClosed[0].status !== 'CLOSED' || !dbClosed[0].closed_at) {
      throw new Error('Case 9 DB state mismatch');
    }
    console.log('>>> CASE 9 PASSED (200) <<<\n');

    // 10. Close a draft quiz — reject it
    console.log(`--- CASE 10: Close a draft quiz (quizId=${secondaryDraftId}) ---`);
    const c10 = await postJson(`${API_BASE}/quizzes/${secondaryDraftId}/close`, headersNoBodyA);
    console.log(`Status: ${c10.status}`, c10.data);
    if (c10.status !== 404) throw new Error(`Case 10 expected 404, got ${c10.status}`);
    console.log('>>> CASE 10 PASSED (404) <<<\n');

    // 11. Close an already closed quiz — reject it
    console.log(`--- CASE 11: Close an already closed quiz (quizId=${validDraftId}) ---`);
    const c11 = await postJson(`${API_BASE}/quizzes/${validDraftId}/close`, headersNoBodyA);
    console.log(`Status: ${c11.status}`, c11.data);
    if (c11.status !== 404) throw new Error(`Case 11 expected 404, got ${c11.status}`);
    console.log('>>> CASE 11 PASSED (404) <<<\n');

    console.log('ALL 11 PUBLISH & CLOSE CASES PASSED SUCCESSFULLY!');
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
