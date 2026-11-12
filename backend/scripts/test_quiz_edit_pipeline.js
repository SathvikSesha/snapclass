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

async function createDraft(headers, title, questions) {
  const res = await fetch(`${API_BASE}/subjects/5/quizzes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title,
      description: 'Initial description',
      difficulty: 'mixed',
      questions,
    }),
  });
  const data = await res.json();
  if (res.status !== 201) {
    throw new Error(`Setup createDraft failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.data.quizId;
}

async function getQuizDetails(headers, quizId) {
  const res = await fetch(`${API_BASE}/quizzes/${quizId}`, { headers });
  const data = await res.json();
  return { status: res.status, data };
}

async function patchQuiz(headers, quizId, body) {
  const res = await fetch(`${API_BASE}/quizzes/${quizId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

function makeMcq(text, correctIndex = 0, marks = 1) {
  return {
    question: text,
    questionType: 'MCQ',
    options: [
      { text: 'Option A', isCorrect: correctIndex === 0 },
      { text: 'Option B', isCorrect: correctIndex === 1 },
      { text: 'Option C', isCorrect: correctIndex === 2 },
      { text: 'Option D', isCorrect: correctIndex === 3 },
    ],
    explanation: 'Initial explanation',
    difficulty: 'medium',
    marks,
    sourceDocumentId: 7,
    sourceLocation: 'page 1',
  };
}

async function main() {
  console.log('====================================================');
  console.log('         FACULTY QUIZ EDIT (PATCH) TEST SUITE       ');
  console.log('====================================================\n');

  const tokenA = generateAccessToken({ user_id: 6, role: 'FACULTY' });  // faculty_id = 2
  const tokenB = generateAccessToken({ user_id: 15, role: 'FACULTY' }); // faculty_id = 5

  const headersA = { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' };
  const headersB = { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' };

  const cleanupQuizIds = [];

  try {
    // Setup Quiz 1 (main quiz to edit, 3 questions)
    const quiz1Id = await createDraft(headersA, 'Original Quiz Title', [
      makeMcq('Question 1 original', 0, 1),
      makeMcq('Question 2 original', 0, 2),
      makeMcq('Question 3 to remove', 0, 1),
    ]);
    cleanupQuizIds.push(quiz1Id);

    const initialDetails = await getQuizDetails(headersA, quiz1Id);
    const [q1, q2, q3] = initialDetails.data.data.questions;

    // Setup Quiz 2 (same faculty, different quiz, to grab another quiz's questionId)
    const quiz2Id = await createDraft(headersA, 'Second Quiz', [makeMcq('Other quiz question', 0, 1)]);
    cleanupQuizIds.push(quiz2Id);
    const quiz2Details = await getQuizDetails(headersA, quiz2Id);
    const otherQuizQId = quiz2Details.data.data.questions[0].questionId;

    // Setup Quiz 3 (owned by another faculty)
    const [resOtherFac] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, total_marks)
       VALUES (33, 5, 'Other Faculty Draft', 'Private', 'DRAFT', 'MEDIUM', 1)`
    );
    const otherFacQuizId = resOtherFac.insertId;
    cleanupQuizIds.push(otherFacQuizId);

    // Setup Quiz 4 (PUBLISHED) & Quiz 5 (CLOSED)
    const [resPub] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, total_marks, published_at)
       VALUES (5, 2, 'Published Quiz', 'Locked', 'PUBLISHED', 'MEDIUM', 1, NOW())`
    );
    const pubQuizId = resPub.insertId;
    cleanupQuizIds.push(pubQuizId);

    const [resClosed] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, total_marks, closed_at)
       VALUES (5, 2, 'Closed Quiz', 'Locked', 'CLOSED', 'MEDIUM', 1, NOW())`
    );
    const closedQuizId = resClosed.insertId;
    cleanupQuizIds.push(closedQuizId);

    console.log(`Setup complete: quiz1Id=${quiz1Id} (qIds=[${q1.questionId}, ${q2.questionId}, ${q3.questionId}]), otherQuizQId=${otherQuizQId}\n`);

    // --------------------------------------------------------
    // SCENARIO 1-7 Combined:
    // - Update quiz title and description
    // - Edit an existing question (Q2)
    // - Change its correct answer (Option A -> Option C)
    // - Reorder existing questions (Q2 first, Q1 second)
    // - Remove an existing question by omitting it (omit Q3)
    // - Add a new question without questionId (Q4, marks=2)
    // - Recalculate total marks (2 + 1 + 2 = 5)
    // --------------------------------------------------------
    console.log('--- SCENARIOS 1-7: Title/desc, edit Q, change correct answer, reorder, omit Q3, add Q4, recalc marks ---');
    const patchRes = await patchQuiz(headersA, quiz1Id, {
      title: 'Updated Quiz Title',
      description: 'Updated quiz description',
      difficulty: 'hard',
      questions: [
        {
          questionId: q2.questionId,
          question: 'Question 2 EDITED text',
          questionType: 'MCQ',
          options: [
            { text: 'Option A', isCorrect: false },
            { text: 'Option B', isCorrect: false },
            { text: 'Option C', isCorrect: true }, // changed correct answer
            { text: 'Option D', isCorrect: false },
          ],
          explanation: 'Updated explanation for Q2',
          difficulty: 'hard',
          marks: 2,
          sourceDocumentId: 7,
          sourceLocation: 'page 2',
        },
        {
          questionId: q1.questionId,
          question: q1.question,
          questionType: 'MCQ',
          options: [
            { text: 'Option A', isCorrect: true },
            { text: 'Option B', isCorrect: false },
            { text: 'Option C', isCorrect: false },
            { text: 'Option D', isCorrect: false },
          ],
          explanation: q1.explanation,
          difficulty: 'medium',
          marks: 1,
          sourceDocumentId: 7,
          sourceLocation: 'page 1',
        },
        {
          // New question without questionId
          question: 'Question 4 NEW True/False',
          questionType: 'TRUE_FALSE',
          options: [
            { text: 'True', isCorrect: true },
            { text: 'False', isCorrect: false },
          ],
          explanation: 'New question explanation',
          difficulty: 'easy',
          marks: 2,
          sourceDocumentId: 7,
          sourceLocation: 'page 3',
        },
      ],
    });

    console.log(`Status: ${patchRes.status}`, patchRes.data);
    if (
      patchRes.status !== 200 ||
      patchRes.data.message !== 'Quiz draft updated successfully' ||
      patchRes.data.data.quizId !== quiz1Id ||
      patchRes.data.data.totalQuestions !== 3 ||
      patchRes.data.data.totalMarks !== 5
    ) {
      throw new Error(`Scenarios 1-7 PATCH response mismatch: ${JSON.stringify(patchRes.data)}`);
    }

    const afterDetails = await getQuizDetails(headersA, quiz1Id);
    const updatedQuiz = afterDetails.data.data.quiz;
    const updatedQs = afterDetails.data.data.questions;

    if (updatedQuiz.title !== 'Updated Quiz Title' || updatedQuiz.description !== 'Updated quiz description') {
      throw new Error('Title/description did not update');
    }
    if (updatedQuiz.totalMarks !== 5) {
      throw new Error(`Expected totalMarks=5, got ${updatedQuiz.totalMarks}`);
    }
    if (updatedQs.length !== 3) {
      throw new Error(`Expected 3 questions, got ${updatedQs.length}`);
    }
    if (
      updatedQs[0].questionId !== q2.questionId ||
      updatedQs[0].questionOrder !== 1 ||
      updatedQs[0].question !== 'Question 2 EDITED text' ||
      !updatedQs[0].options.find(o => o.text === 'Option C')?.isCorrect ||
      updatedQs[0].options.find(o => o.text === 'Option A')?.isCorrect
    ) {
      throw new Error(`Q2 reorder/edit/answer verification failed: ${JSON.stringify(updatedQs[0])}`);
    }
    if (updatedQs[1].questionId !== q1.questionId || updatedQs[1].questionOrder !== 2) {
      throw new Error(`Q1 reorder verification failed: ${JSON.stringify(updatedQs[1])}`);
    }
    if (updatedQs[2].question !== 'Question 4 NEW True/False' || updatedQs[2].questionOrder !== 3) {
      throw new Error(`New Q4 verification failed: ${JSON.stringify(updatedQs[2])}`);
    }
    if (updatedQs.some(q => q.questionId === q3.questionId)) {
      throw new Error('Omitted Q3 was not deleted');
    }
    console.log('>>> SCENARIOS 1-7 PASSED <<<\n');

    // --------------------------------------------------------
    // SCENARIO 8: Reject a question ID belonging to another quiz
    // --------------------------------------------------------
    console.log(`--- SCENARIO 8: Reject questionId=${otherQuizQId} belonging to another quiz ---`);
    const s8 = await patchQuiz(headersA, quiz1Id, {
      title: 'Updated Quiz Title',
      description: 'Desc',
      difficulty: 'medium',
      questions: [
        {
          questionId: otherQuizQId,
          question: 'Hijacked question',
          questionType: 'MCQ',
          options: [
            { text: 'Option A', isCorrect: true },
            { text: 'Option B', isCorrect: false },
          ],
          difficulty: 'medium',
          marks: 1,
        },
      ],
    });
    console.log(`Status: ${s8.status}`, s8.data);
    if (s8.status !== 400) throw new Error(`Scenario 8 expected 400, got ${s8.status}`);
    console.log('>>> SCENARIO 8 PASSED (400) <<<\n');

    // --------------------------------------------------------
    // SCENARIO 9: Reject editing another faculty's quiz
    // --------------------------------------------------------
    console.log(`--- SCENARIO 9: Reject editing another faculty's quiz (${otherFacQuizId}) ---`);
    const s9 = await patchQuiz(headersA, otherFacQuizId, {
      title: 'Unauthorized Edit',
      description: 'Desc',
      difficulty: 'medium',
      questions: [makeMcq('Unauthorized Q', 0, 1)],
    });
    console.log(`Status: ${s9.status}`, s9.data);
    if (s9.status !== 404) throw new Error(`Scenario 9 expected 404, got ${s9.status}`);
    console.log('>>> SCENARIO 9 PASSED (404) <<<\n');

    // --------------------------------------------------------
    // SCENARIO 10: Reject editing a PUBLISHED or CLOSED quiz
    // --------------------------------------------------------
    console.log(`--- SCENARIO 10a: Reject editing PUBLISHED quiz (${pubQuizId}) ---`);
    const s10a = await patchQuiz(headersA, pubQuizId, {
      title: 'Edit Published',
      description: 'Desc',
      difficulty: 'medium',
      questions: [makeMcq('Q', 0, 1)],
    });
    console.log(`Status: ${s10a.status}`, s10a.data);
    if (s10a.status !== 409) throw new Error(`Scenario 10a expected 409, got ${s10a.status}`);

    console.log(`--- SCENARIO 10b: Reject editing CLOSED quiz (${closedQuizId}) ---`);
    const s10b = await patchQuiz(headersA, closedQuizId, {
      title: 'Edit Closed',
      description: 'Desc',
      difficulty: 'medium',
      questions: [makeMcq('Q', 0, 1)],
    });
    console.log(`Status: ${s10b.status}`, s10b.data);
    if (s10b.status !== 409) throw new Error(`Scenario 10b expected 409, got ${s10b.status}`);
    console.log('>>> SCENARIO 10 PASSED (409) <<<\n');

    // --------------------------------------------------------
    // SCENARIO 11: Verify rollback when an insertion fails midway
    // --------------------------------------------------------
    console.log('--- SCENARIO 11: Rollback when insertion fails midway ---');
    const beforeRollback = await getQuizDetails(headersA, quiz1Id);

    await pool.query('DROP TRIGGER IF EXISTS trg_fail_quiz_patch_option');
    await pool.query(`
      CREATE TRIGGER trg_fail_quiz_patch_option
      BEFORE INSERT ON quiz_question_options
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Simulated midway PATCH failure';
      END
    `);

    try {
      const s11 = await patchQuiz(headersA, quiz1Id, {
        title: 'SHOULD ROLL BACK TITLE',
        description: 'Should roll back',
        difficulty: 'easy',
        questions: [makeMcq('New Q that fails on options insert', 0, 10)],
      });
      console.log(`Status: ${s11.status}`, s11.data);
      if (s11.status < 500) throw new Error(`Scenario 11 expected 500, got ${s11.status}`);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS trg_fail_quiz_patch_option');
    }

    const afterRollback = await getQuizDetails(headersA, quiz1Id);
    if (
      afterRollback.data.data.quiz.title !== beforeRollback.data.data.quiz.title ||
      afterRollback.data.data.quiz.totalMarks !== beforeRollback.data.data.quiz.totalMarks ||
      afterRollback.data.data.questions.length !== beforeRollback.data.data.questions.length ||
      afterRollback.data.data.questions[0].questionOrder !== 1 ||
      afterRollback.data.data.questions[0].options.length !== 4
    ) {
      throw new Error('Scenario 11 rollback failed: quiz state changed after DB error');
    }
    console.log('>>> SCENARIO 11 PASSED (Transaction rolled back cleanly; title, order, marks & options unchanged) <<<\n');

    console.log('ALL 11 SCENARIOS PASSED SUCCESSFULLY!');
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS trg_fail_quiz_patch_option').catch(() => {});
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

