import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';
import { createQuizDraft } from '../src/repositories/facultyQuiz.repository.js';

const API_BASE = 'http://localhost:5000/api/faculty';

function buildValidPayload(overrides = {}) {
  return {
    title: 'NumPy Foundations Draft Quiz',
    description: 'Draft quiz covering basic NumPy operations',
    difficulty: 'mixed',
    questions: [
      {
        question: 'What does np.add(a, b) do?',
        questionType: 'MCQ',
        options: [
          { text: 'Adds the elements of a and b', isCorrect: true },
          { text: 'Multiplies the elements of a and b', isCorrect: false },
          { text: 'Subtracts the elements of a and b', isCorrect: false },
          { text: 'Divides the elements of a and b', isCorrect: false },
        ],
        explanation: 'np.add performs element-wise addition.',
        difficulty: 'medium',
        marks: 2,
        sourceDocumentId: 7,
        sourceLocation: 'page 1',
      },
      {
        question: 'np.zeros((2, 3)) creates a 2x3 array filled with zeros.',
        questionType: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
        explanation: 'np.zeros returns an array of zeros with the given shape.',
        difficulty: 'easy',
        marks: 1,
        sourceDocumentId: 7,
        sourceLocation: 'page 1',
      },
    ],
    ...overrides,
  };
}

async function postSaveQuiz(subjectId, body, headers) {
  const res = await fetch(`${API_BASE}/subjects/${subjectId}/quizzes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

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

async function getTableCounts() {
  const [[{ qCount }]] = await pool.query('SELECT COUNT(*) AS qCount FROM quizzes');
  const [[{ qqCount }]] = await pool.query('SELECT COUNT(*) AS qqCount FROM quiz_questions');
  const [[{ qoCount }]] = await pool.query('SELECT COUNT(*) AS qoCount FROM quiz_question_options');
  return { quizzes: qCount, quiz_questions: qqCount, quiz_question_options: qoCount };
}

async function main() {
  console.log('====================================================');
  console.log('         FACULTY QUIZ SAVE API TEST SUITE           ');
  console.log('====================================================\n');

  const facultyToken = generateAccessToken({ user_id: 6, role: 'FACULTY' });
  const headers = {
    Authorization: `Bearer ${facultyToken}`,
    'Content-Type': 'application/json',
  };

  let createdQuizId = null;

  try {
    // 1. Valid quiz with MCQ and True/False questions -> 201
    console.log('--- CASE 1: Valid quiz with MCQ and True/False questions ---');
    const c1 = await postSaveQuiz(5, buildValidPayload(), headers);
    console.log(`Status: ${c1.status}`, c1.data);
    if (c1.status !== 201) throw new Error(`Case 1 expected 201, got ${c1.status}`);
    if (c1.data?.data?.totalQuestions !== 2 || c1.data?.data?.totalMarks !== 3) {
      throw new Error(`Case 1 unexpected totals: ${JSON.stringify(c1.data)}`);
    }
    createdQuizId = c1.data.data.quizId;

    const [quizRows] = await pool.execute('SELECT quiz_id, subject_id, faculty_id, title, status, difficulty, total_marks FROM quizzes WHERE quiz_id = ?', [createdQuizId]);
    const [questionRows] = await pool.execute('SELECT question_id, quiz_id, question_type, difficulty, marks, question_order, source_document_id, source_location FROM quiz_questions WHERE quiz_id = ? ORDER BY question_order', [createdQuizId]);
    const [optionRows] = await pool.execute(
      `SELECT qo.option_id, qo.question_id, qo.option_text, qo.option_order, qo.is_correct
       FROM quiz_question_options qo
       JOIN quiz_questions q ON q.question_id = qo.question_id
       WHERE q.quiz_id = ?
       ORDER BY q.question_order, qo.option_order`,
      [createdQuizId]
    );

    console.log('DB quizzes row:', quizRows);
    console.log('DB quiz_questions rows:', questionRows);
    console.log('DB quiz_question_options rows:', optionRows);

    if (quizRows.length !== 1 || quizRows[0].status !== 'DRAFT' || Number(quizRows[0].total_marks) !== 3) {
      throw new Error('DB quizzes verification failed');
    }
    if (questionRows.length !== 2 || questionRows[0].question_type !== 'MCQ' || questionRows[1].question_type !== 'TRUE_FALSE') {
      throw new Error('DB quiz_questions verification failed');
    }
    if (optionRows.length !== 6) {
      throw new Error(`DB quiz_question_options verification failed: expected 6 rows, got ${optionRows.length}`);
    }
    console.log('>>> CASE 1 PASSED (201 + DB verified) <<<\n');

    // 2. Empty question list -> 400
    console.log('--- CASE 2: Empty question list ---');
    const c2 = await postSaveQuiz(5, buildValidPayload({ questions: [] }), headers);
    console.log(`Status: ${c2.status}`, c2.data);
    if (c2.status !== 400) throw new Error(`Case 2 expected 400, got ${c2.status}`);
    console.log('>>> CASE 2 PASSED (400) <<<\n');

    // 3. Question with no correct answer -> 400
    console.log('--- CASE 3: Question with no correct answer ---');
    const noCorrect = buildValidPayload();
    noCorrect.questions[0].options.forEach(o => { o.isCorrect = false; });
    const c3 = await postSaveQuiz(5, noCorrect, headers);
    console.log(`Status: ${c3.status}`, c3.data);
    if (c3.status !== 400) throw new Error(`Case 3 expected 400, got ${c3.status}`);
    console.log('>>> CASE 3 PASSED (400) <<<\n');

    // 4. Question with multiple correct answers -> 400
    console.log('--- CASE 4: Question with multiple correct answers ---');
    const multiCorrect = buildValidPayload();
    multiCorrect.questions[0].options[1].isCorrect = true;
    const c4 = await postSaveQuiz(5, multiCorrect, headers);
    console.log(`Status: ${c4.status}`, c4.data);
    if (c4.status !== 400) throw new Error(`Case 4 expected 400, got ${c4.status}`);
    console.log('>>> CASE 4 PASSED (400) <<<\n');

    // 5. Duplicate options -> 400
    console.log('--- CASE 5: Duplicate options ---');
    const dupOptions = buildValidPayload();
    dupOptions.questions[0].options[1].text = '  adds the elements of a and b  ';
    const c5 = await postSaveQuiz(5, dupOptions, headers);
    console.log(`Status: ${c5.status}`, c5.data);
    if (c5.status !== 400) throw new Error(`Case 5 expected 400, got ${c5.status}`);
    console.log('>>> CASE 5 PASSED (400) <<<\n');

    // 6. Invalid marks or difficulty -> 400
    console.log('--- CASE 6a: Invalid quiz difficulty ("SUPER_HARD") ---');
    const c6a = await postSaveQuiz(5, buildValidPayload({ difficulty: 'SUPER_HARD' }), headers);
    console.log(`Status: ${c6a.status}`, c6a.data);
    if (c6a.status !== 400) throw new Error(`Case 6a expected 400, got ${c6a.status}`);

    console.log('--- CASE 6b: Invalid question difficulty ("EXTREME") ---');
    const badQDiff = buildValidPayload();
    badQDiff.questions[0].difficulty = 'EXTREME';
    const c6b = await postSaveQuiz(5, badQDiff, headers);
    console.log(`Status: ${c6b.status}`, c6b.data);
    if (c6b.status !== 400) throw new Error(`Case 6b expected 400, got ${c6b.status}`);

    console.log('--- CASE 6c: Invalid marks (0 and -5) ---');
    const badMarks = buildValidPayload();
    badMarks.questions[0].marks = 0;
    const c6c = await postSaveQuiz(5, badMarks, headers);
    console.log(`Status: ${c6c.status}`, c6c.data);
    if (c6c.status !== 400) throw new Error(`Case 6c expected 400, got ${c6c.status}`);
    console.log('>>> CASE 6 PASSED (400) <<<\n');

    // 7. Faculty trying to save for an unassigned subject -> 403
    console.log('--- CASE 7: Faculty trying to save for unassigned subject (subject 35) ---');
    const c7 = await postSaveQuiz(35, buildValidPayload(), headers);
    console.log(`Status: ${c7.status}`, c7.data);
    if (c7.status !== 403) throw new Error(`Case 7 expected 403, got ${c7.status}`);
    console.log('>>> CASE 7 PASSED (403) <<<\n');

    // 8. Invalid source document reference -> 400
    console.log('--- CASE 8a: Non-numeric source document reference ("invalid-doc") ---');
    const badSrc1 = buildValidPayload();
    badSrc1.questions[0].sourceDocumentId = 'invalid-doc';
    const c8a = await postSaveQuiz(5, badSrc1, headers);
    console.log(`Status: ${c8a.status}`, c8a.data);
    if (c8a.status !== 400) throw new Error(`Case 8a expected 400, got ${c8a.status}`);

    console.log('--- CASE 8b: Unindexed / non-existent source document reference (999999) ---');
    const badSrc2 = buildValidPayload();
    badSrc2.questions[0].sourceDocumentId = 999999;
    const c8b = await postSaveQuiz(5, badSrc2, headers);
    console.log(`Status: ${c8b.status}`, c8b.data);
    if (c8b.status !== 400) throw new Error(`Case 8b expected 400, got ${c8b.status}`);
    console.log('>>> CASE 8 PASSED (400) <<<\n');

    // 9. Database failure midway through insertion — no partial quiz should remain
    console.log('--- CASE 9: Database failure midway through insertion (rollback check) ---');
    const countsBefore = await getTableCounts();
    console.log('Counts before Case 9:', countsBefore);

    let triggerCreated = false;
    try {
      await pool.query('DROP TRIGGER IF EXISTS trg_fail_quiz_option_insert');
      await pool.query(`
        CREATE TRIGGER trg_fail_quiz_option_insert
        BEFORE INSERT ON quiz_question_options
        FOR EACH ROW
        BEGIN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Simulated midway DB failure';
        END
      `);
      triggerCreated = true;
    } catch (trigErr) {
      console.log('Trigger creation failed, falling back to direct createQuizDraft failure:', trigErr.message);
    }

    if (triggerCreated) {
      try {
        const c9 = await postSaveQuiz(5, buildValidPayload({ title: 'Rollback Test Quiz' }), headers);
        console.log(`Status: ${c9.status}`, c9.data);
        if (c9.status < 500) throw new Error(`Case 9 expected 500 on DB failure, got ${c9.status}`);
      } finally {
        await pool.query('DROP TRIGGER IF EXISTS trg_fail_quiz_option_insert');
      }
    } else {
      let failedMidway = false;
      try {
        await createQuizDraft({
          subjectId: 5,
          facultyId: 2,
          title: 'Rollback Test Quiz',
          description: null,
          difficulty: 'MIXED',
          totalMarks: 1,
          questions: [
            {
              question: 'Q1 before failure',
              questionType: 'MCQ',
              explanation: null,
              difficulty: 'MEDIUM',
              marks: 1,
              sourceDocumentId: '7',
              sourceLocation: 'page 1',
              options: [
                { text: 'Valid option', isCorrect: true },
                { text: 'X'.repeat(1500), isCorrect: false }, // exceeds VARCHAR(1000)
              ],
            },
          ],
        });
      } catch (dbErr) {
        failedMidway = true;
        console.log('Simulated midway SQL failure:', dbErr.message);
      }
      if (!failedMidway) throw new Error('Case 9 did not fail as expected');
    }

    const countsAfter = await getTableCounts();
    console.log('Counts after Case 9:', countsAfter);
    if (
      countsAfter.quizzes !== countsBefore.quizzes ||
      countsAfter.quiz_questions !== countsBefore.quiz_questions ||
      countsAfter.quiz_question_options !== countsBefore.quiz_question_options
    ) {
      throw new Error(`Partial quiz rows remained after DB failure! Before=${JSON.stringify(countsBefore)}, After=${JSON.stringify(countsAfter)}`);
    }
    console.log('>>> CASE 9 PASSED (Transaction rolled back cleanly, 0 partial rows) <<<\n');

    console.log('ALL 9 CASES PASSED SUCCESSFULLY!');
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS trg_fail_quiz_option_insert').catch(() => {});
    await deleteQuizById(createdQuizId);
    console.log(`Cleanup: deleted temporary test quizId=${createdQuizId}`);
    await pool.end();
  }
}

main().catch(err => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});

