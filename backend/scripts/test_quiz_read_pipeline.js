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

async function main() {
  console.log('====================================================');
  console.log('       FACULTY QUIZ LIST & DETAILS TEST SUITE       ');
  console.log('====================================================\n');

  const facultyTokenA = generateAccessToken({ user_id: 6, role: 'FACULTY' });   // faculty_id = 2 (ACTIVE, subjects 5, 33)
  const facultyTokenB = generateAccessToken({ user_id: 2, role: 'FACULTY' });   // faculty_id = 1 (ACTIVE)

  const headersA = {
    Authorization: `Bearer ${facultyTokenA}`,
    'Content-Type': 'application/json',
  };
  const headersB = {
    Authorization: `Bearer ${facultyTokenB}`,
    'Content-Type': 'application/json',
  };

  let quizDraftId = null;     // faculty_id 2, subject 5, DRAFT, 2 questions
  let quizEmptyPubId = null;  // faculty_id 2, subject 33, PUBLISHED, 0 questions
  let quizOtherId = null;     // faculty_id 5, subject 33, DRAFT, 0 questions

  try {
    // Setup Quiz 1 (DRAFT on subject 5 via POST save endpoint)
    const createRes = await fetch(`${API_BASE}/subjects/5/quizzes`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        title: 'NumPy Draft Quiz',
        description: 'Covers basic NumPy array creation and math',
        difficulty: 'mixed',
        questions: [
          {
            question: 'What does np.add(a, b) do?',
            questionType: 'MCQ',
            options: [
              { text: 'Adds elements of a and b', isCorrect: true },
              { text: 'Multiplies elements of a and b', isCorrect: false },
              { text: 'Subtracts elements of a and b', isCorrect: false },
              { text: 'Divides elements of a and b', isCorrect: false },
            ],
            explanation: 'np.add performs element-wise addition.',
            difficulty: 'medium',
            marks: 2,
            sourceDocumentId: 7,
            sourceLocation: 'page 1',
          },
          {
            question: 'np.zeros((2,3)) returns an array of zeros.',
            questionType: 'TRUE_FALSE',
            options: [
              { text: 'True', isCorrect: true },
              { text: 'False', isCorrect: false },
            ],
            explanation: 'np.zeros fills an array with 0s.',
            difficulty: 'easy',
            marks: 1,
            sourceDocumentId: 7,
            sourceLocation: 'page 1',
          },
        ],
      }),
    });
    const createData = await createRes.json();
    if (createRes.status !== 201) {
      throw new Error(`Setup Quiz 1 failed (${createRes.status}): ${JSON.stringify(createData)}`);
    }
    quizDraftId = createData.data.quizId;

    // Setup Quiz 2 (PUBLISHED, subject 33, 0 questions - legacy/empty record)
    const [resEmptyPub] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, total_marks, published_at)
       VALUES (33, 2, 'Published Empty Legacy Quiz', 'No questions yet', 'PUBLISHED', 'EASY', 0, NOW())`
    );
    quizEmptyPubId = resEmptyPub.insertId;

    // Setup Quiz 3 (owned by another faculty: faculty_id = 1, subject 33)
    const [resOther] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, total_marks)
       VALUES (33, 1, 'Other Faculty Private Quiz', 'Owned by faculty 1', 'DRAFT', 'MEDIUM', 5)`
    );
    quizOtherId = resOther.insertId;

    console.log(`Setup complete: quizDraftId=${quizDraftId}, quizEmptyPubId=${quizEmptyPubId}, quizOtherId=${quizOtherId}\n`);

    // Test 1: List all quizzes for authenticated faculty
    console.log('--- TEST 1: GET /api/faculty/quizzes ---');
    const t1Res = await fetch(`${API_BASE}/quizzes`, { headers: headersA });
    const t1Data = await t1Res.json();
    console.log(`Status: ${t1Res.status}`, JSON.stringify(t1Data, null, 2));
    if (t1Res.status !== 200) throw new Error(`Test 1 expected 200, got ${t1Res.status}`);
    const idsT1 = t1Data.data.quizzes.map(q => q.quizId);
    if (!idsT1.includes(quizDraftId) || !idsT1.includes(quizEmptyPubId) || idsT1.includes(quizOtherId)) {
      throw new Error(`Test 1 ownership mismatch: got quizIds=${JSON.stringify(idsT1)}`);
    }
    console.log('>>> TEST 1 PASSED <<<\n');

    // Test 2: Filter drafts (?status=DRAFT)
    console.log('--- TEST 2: GET /api/faculty/quizzes?status=DRAFT ---');
    const t2Res = await fetch(`${API_BASE}/quizzes?status=DRAFT`, { headers: headersA });
    const t2Data = await t2Res.json();
    console.log(`Status: ${t2Res.status}`, t2Data.data.quizzes.map(q => ({ quizId: q.quizId, status: q.status, title: q.title })));
    if (t2Res.status !== 200) throw new Error(`Test 2 expected 200, got ${t2Res.status}`);
    if (
      t2Data.data.quizzes.length !== 1 ||
      t2Data.data.quizzes[0].quizId !== quizDraftId ||
      t2Data.data.quizzes[0].status !== 'DRAFT'
    ) {
      throw new Error(`Test 2 filter mismatch: ${JSON.stringify(t2Data)}`);
    }
    console.log('>>> TEST 2 PASSED <<<\n');

    // Test 3: Filter by subject (?subjectId=5)
    console.log('--- TEST 3: GET /api/faculty/quizzes?subjectId=5 ---');
    const t3Res = await fetch(`${API_BASE}/quizzes?subjectId=5`, { headers: headersA });
    const t3Data = await t3Res.json();
    console.log(`Status: ${t3Res.status}`, t3Data.data.quizzes.map(q => ({ quizId: q.quizId, subjectId: q.subjectId, title: q.title })));
    if (t3Res.status !== 200) throw new Error(`Test 3 expected 200, got ${t3Res.status}`);
    if (
      t3Data.data.quizzes.length !== 1 ||
      t3Data.data.quizzes[0].quizId !== quizDraftId ||
      t3Data.data.quizzes[0].subjectId !== 5
    ) {
      throw new Error(`Test 3 subject filter mismatch: ${JSON.stringify(t3Data)}`);
    }
    console.log('>>> TEST 3 PASSED <<<\n');

    // Test 4: Get quiz details (GET /api/faculty/quizzes/:quizId)
    console.log(`--- TEST 4: GET /api/faculty/quizzes/${quizDraftId} ---`);
    const t4Res = await fetch(`${API_BASE}/quizzes/${quizDraftId}`, { headers: headersA });
    const t4Data = await t4Res.json();
    console.log(`Status: ${t4Res.status}`, JSON.stringify(t4Data, null, 2));
    if (t4Res.status !== 200) throw new Error(`Test 4 expected 200, got ${t4Res.status}`);
    const qs = t4Data.data.questions;
    if (
      t4Data.data.quiz.quizId !== quizDraftId ||
      qs.length !== 2 ||
      qs[0].options.length !== 4 ||
      qs[1].options.length !== 2 ||
      !qs[0].explanation ||
      !qs[0].options.some(o => o.isCorrect === true)
    ) {
      throw new Error(`Test 4 details verification failed: ${JSON.stringify(t4Data)}`);
    }
    console.log('>>> TEST 4 PASSED <<<\n');

    // Test 5: Authorization (retrieve another faculty's quiz -> 404 Quiz not found)
    console.log(`--- TEST 5a: Faculty A retrieving Faculty B quiz (${quizOtherId}) -> 404 ---`);
    const t5aRes = await fetch(`${API_BASE}/quizzes/${quizOtherId}`, { headers: headersA });
    const t5aData = await t5aRes.json();
    console.log(`Status: ${t5aRes.status}`, t5aData);
    if (t5aRes.status !== 404 || t5aData.message !== 'Quiz not found') {
      throw new Error(`Test 5a expected 404 Quiz not found, got ${t5aRes.status} ${JSON.stringify(t5aData)}`);
    }

    console.log(`--- TEST 5b: Faculty B retrieving Faculty A quiz (${quizDraftId}) -> 404 ---`);
    const t5bRes = await fetch(`${API_BASE}/quizzes/${quizDraftId}`, { headers: headersB });
    const t5bData = await t5bRes.json();
    console.log(`Status: ${t5bRes.status}`, t5bData);
    if (t5bRes.status !== 404 || t5bData.message !== 'Quiz not found') {
      throw new Error(`Test 5b expected 404 Quiz not found, got ${t5bRes.status} ${JSON.stringify(t5bData)}`);
    }
    console.log('>>> TEST 5 PASSED (404 Quiz not found) <<<\n');

    // Test 6: Empty questions quiz returns questions: []
    console.log(`--- TEST 6: Quiz with no questions (${quizEmptyPubId}) returns questions: [] ---`);
    const t6Res = await fetch(`${API_BASE}/quizzes/${quizEmptyPubId}`, { headers: headersA });
    const t6Data = await t6Res.json();
    console.log(`Status: ${t6Res.status}`, {
      quizId: t6Data.data?.quiz?.quizId,
      title: t6Data.data?.quiz?.title,
      questions: t6Data.data?.questions,
    });
    if (t6Res.status !== 200 || !Array.isArray(t6Data.data.questions) || t6Data.data.questions.length !== 0) {
      throw new Error(`Test 6 expected 200 with empty questions array, got ${t6Res.status} ${JSON.stringify(t6Data)}`);
    }
    console.log('>>> TEST 6 PASSED (empty questions array returned cleanly) <<<\n');

    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  } finally {
    await deleteQuizById(quizDraftId);
    await deleteQuizById(quizEmptyPubId);
    await deleteQuizById(quizOtherId);
    console.log(`Cleanup: deleted temporary quizzes (${quizDraftId}, ${quizEmptyPubId}, ${quizOtherId})`);
    await pool.end();
  }
}

main().catch(err => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
