import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const STUDENT_API = 'http://localhost:5000/api/student';
const FACULTY_API = 'http://localhost:5000/api/faculty';

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

async function main() {
  console.log('====================================================');
  console.log('   STUDENT RESULTS, MARKS & FACULTY RESULTS SUITE   ');
  console.log('====================================================\n');

  const studentAToken = generateAccessToken({ user_id: 5, role: 'STUDENT' }); // student_id=2, enrolled in 33
  const studentBToken = generateAccessToken({ user_id: 1, role: 'STUDENT' }); // student_id=1, enrolled in 1
  const facultyAToken = generateAccessToken({ user_id: 6, role: 'FACULTY' }); // faculty_id=2 (owns subject 33)
  const facultyBToken = generateAccessToken({ user_id: 2, role: 'FACULTY' }); // faculty_id=1

  const headersStuA = { Authorization: `Bearer ${studentAToken}`, 'Content-Type': 'application/json' };
  const headersStuB = { Authorization: `Bearer ${studentBToken}`, 'Content-Type': 'application/json' };
  const headersFacA = { Authorization: `Bearer ${facultyAToken}` };
  const headersFacB = { Authorization: `Bearer ${facultyBToken}` };

  const cleanupQuizIds = [];
  const now = Date.now();
  const past1h = toMySQLUtc(new Date(now - 1 * 3600 * 1000));
  const future1d = toMySQLUtc(new Date(now + 24 * 3600 * 1000));

  try {
    // 1. Main published quiz in subject 33 owned by faculty_id=2 (totalMarks = 3)
    const [rMain] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, description, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (33, 2, 'Results & Marks Quiz', 'Testing results', 'PUBLISHED', 'MEDIUM', 30, 5, 3, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizMainId = rMain.insertId;
    cleanupQuizIds.push(quizMainId);

    const [rQ1] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, explanation, difficulty, marks, question_order)
       VALUES (?, 'Q1 (2 marks)', 'MCQ', 'Q1 explanation after submit', 'MEDIUM', 2, 1)`,
      [quizMainId]
    );
    const q1Id = rQ1.insertId;
    const [rQ1O1] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "Q1 Correct", 1, 1)', [q1Id]);
    const [rQ1O2] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "Q1 Wrong", 2, 0)', [q1Id]);

    const [rQ2] = await pool.execute(
      `INSERT INTO quiz_questions (quiz_id, question_text, question_type, explanation, difficulty, marks, question_order)
       VALUES (?, 'Q2 (1 mark)', 'TRUE_FALSE', 'Q2 explanation after submit', 'EASY', 1, 2)`,
      [quizMainId]
    );
    const q2Id = rQ2.insertId;
    const [rQ2O1] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "True", 1, 1)', [q2Id]);
    const [rQ2O2] = await pool.execute('INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct) VALUES (?, "False", 2, 0)', [q2Id]);

    // 2. Closed quiz in subject 33 with NO attempts for Student A (plus 1 attempt by Student B to ensure isolation)
    const [rNoAtt] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at, closed_at)
       VALUES (33, 2, 'No Attempts Closed Quiz', 'CLOSED', 'EASY', 20, 2, 4, ?, ?, ?, ?)`,
      [past1h, future1d, past1h, past1h]
    );
    const quizNoAttemptsId = rNoAtt.insertId;
    cleanupQuizIds.push(quizNoAttemptsId);

    // Insert an attempt by Student B (student_id=1) on quizNoAttemptsId to verify Student A never sees it
    await pool.execute(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number, status, started_at, expires_at, submitted_at, score, total_marks)
       VALUES (?, 1, 1, 'SUBMITTED', ?, ?, ?, 4.00, 4.00)`,
      [quizNoAttemptsId, past1h, future1d, past1h]
    );

    // 3. Draft quiz in subject 33 (must not appear in student marks)
    const [rDraft] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, total_marks)
       VALUES (33, 2, 'Hidden Draft Marks Quiz', 'DRAFT', 'EASY', 2)`
    );
    const quizDraftId = rDraft.insertId;
    cleanupQuizIds.push(quizDraftId);

    // 4. Published quiz in unenrolled subject 1 (must not appear in Student A marks)
    const [rOtherSub] = await pool.execute(
      `INSERT INTO quizzes (subject_id, faculty_id, title, status, difficulty, duration_minutes, max_attempts, total_marks, start_at, deadline_at, published_at)
       VALUES (1, 1, 'Unenrolled Subject Marks Quiz', 'PUBLISHED', 'EASY', 30, 1, 5, ?, ?, ?)`,
      [past1h, future1d, past1h]
    );
    const quizUnenrolledId = rOtherSub.insertId;
    cleanupQuizIds.push(quizUnenrolledId);

    // ========================================================
    // Pre-submission check: answers & explanations hidden
    // ========================================================
    const preQuizRes = await fetch(`${STUDENT_API}/quizzes/${quizMainId}`, { headers: headersStuA });
    const preQuizData = await preQuizRes.json();
    for (const q of preQuizData.data.questions) {
      if ('explanation' in q) throw new Error('Explanation leaked before submission');
      for (const o of q.options) {
        if ('isCorrect' in o || 'is_correct' in o) throw new Error('isCorrect leaked before submission');
      }
    }

    // Attempt 1 (SUBMITTED, score = 3: both Q1 and Q2 correct)
    const s1 = await (await fetch(`${STUDENT_API}/quizzes/${quizMainId}/attempts`, { method: 'POST', headers: headersStuA })).json();
    const att1Id = s1.data.attemptId;
    await fetch(`${STUDENT_API}/quiz-attempts/${att1Id}/answers`, {
      method: 'PUT', headers: headersStuA, body: JSON.stringify({ questionId: q1Id, selectedOptionId: rQ1O1.insertId })
    });
    await fetch(`${STUDENT_API}/quiz-attempts/${att1Id}/answers`, {
      method: 'PUT', headers: headersStuA, body: JSON.stringify({ questionId: q2Id, selectedOptionId: rQ2O1.insertId })
    });
    const sub1 = await (await fetch(`${STUDENT_API}/quiz-attempts/${att1Id}/submit`, { method: 'POST', headers: headersStuA })).json();
    if (sub1.data.status !== 'SUBMITTED' || Number(sub1.data.score) !== 3) {
      throw new Error(`Attempt 1 submit mismatch: ${JSON.stringify(sub1)}`);
    }

    // Attempt 2 (AUTO_SUBMITTED, score = 2: Q1 correct, Q2 wrong)
    const s2 = await (await fetch(`${STUDENT_API}/quizzes/${quizMainId}/attempts`, { method: 'POST', headers: headersStuA })).json();
    const att2Id = s2.data.attemptId;
    await fetch(`${STUDENT_API}/quiz-attempts/${att2Id}/answers`, {
      method: 'PUT', headers: headersStuA, body: JSON.stringify({ questionId: q1Id, selectedOptionId: rQ1O1.insertId })
    });
    await fetch(`${STUDENT_API}/quiz-attempts/${att2Id}/answers`, {
      method: 'PUT', headers: headersStuA, body: JSON.stringify({ questionId: q2Id, selectedOptionId: rQ2O2.insertId })
    });
    // Expire attempt 2 before submitting so it triggers AUTO_SUBMITTED
    await pool.execute('UPDATE quiz_attempts SET expires_at = ? WHERE attempt_id = ?', [past1h, att2Id]);
    const sub2 = await (await fetch(`${STUDENT_API}/quiz-attempts/${att2Id}/submit`, { method: 'POST', headers: headersStuA })).json();
    if (sub2.data.status !== 'AUTO_SUBMITTED' || Number(sub2.data.score) !== 2) {
      throw new Error(`Attempt 2 auto-submit mismatch: ${JSON.stringify(sub2)}`);
    }

    // Attempt 3 (leave IN_PROGRESS)
    const s3 = await (await fetch(`${STUDENT_API}/quizzes/${quizMainId}/attempts`, { method: 'POST', headers: headersStuA })).json();
    const att3Id = s3.data.attemptId;

    // ========================================================
    // CHECKLIST 1: STUDENT RESULT API
    // ========================================================
    console.log('--- STUDENT RESULT API ---');
    // 1a. Submitted attempt returns detailed results + explanations & correct answers
    const res1 = await fetch(`${STUDENT_API}/quiz-attempts/${att1Id}/result`, { headers: headersStuA });
    const dRes1 = await res1.json();
    console.log(`Submitted result status=${res1.status}, score=${dRes1.data?.score}, correct=${dRes1.data?.correctAnswers}`);
    if (
      res1.status !== 200 ||
      dRes1.data.status !== 'SUBMITTED' ||
      Number(dRes1.data.score) !== 3 ||
      dRes1.data.correctAnswers !== 2 ||
      !dRes1.data.questions[0].explanation ||
      !dRes1.data.questions[0].options.some(o => o.isCorrect === true && o.isSelected === true)
    ) {
      throw new Error(`Submitted result check failed: ${JSON.stringify(dRes1)}`);
    }

    // 1b. Auto-submitted attempt returns results
    const res2 = await fetch(`${STUDENT_API}/quiz-attempts/${att2Id}/result`, { headers: headersStuA });
    const dRes2 = await res2.json();
    console.log(`Auto-submitted result status=${res2.status}, attemptStatus=${dRes2.data?.status}, score=${dRes2.data?.score}, incorrect=${dRes2.data?.incorrectAnswers}`);
    if (
      res2.status !== 200 ||
      dRes2.data.status !== 'AUTO_SUBMITTED' ||
      Number(dRes2.data.score) !== 2 ||
      dRes2.data.correctAnswers !== 1 ||
      dRes2.data.incorrectAnswers !== 1
    ) {
      throw new Error(`Auto-submitted result check failed: ${JSON.stringify(dRes2)}`);
    }

    // 1c. In-progress attempt returns 409
    const res3 = await fetch(`${STUDENT_API}/quiz-attempts/${att3Id}/result`, { headers: headersStuA });
    const dRes3 = await res3.json();
    console.log(`In-progress result status=${res3.status}`, dRes3);
    if (res3.status !== 409) throw new Error(`Expected 409 for in-progress attempt, got ${res3.status}`);

    // 1d. Another student's attempt returns 404
    const resOther = await fetch(`${STUDENT_API}/quiz-attempts/${att1Id}/result`, { headers: headersStuB });
    const dResOther = await resOther.json();
    console.log(`Other student result status=${resOther.status}`, dResOther);
    if (resOther.status !== 404) throw new Error(`Expected 404 for another student attempt, got ${resOther.status}`);
    console.log('>>> STUDENT RESULT API PASSED <<<\n');

    // ========================================================
    // CHECKLIST 2: STUDENT MARKS API
    // ========================================================
    console.log('--- STUDENT MARKS API ---');
    const marksRes = await fetch(`${STUDENT_API}/marks/quizzes`, { headers: headersStuA });
    const dMarks = await marksRes.json();
    console.log(`Marks status=${marksRes.status}:`, dMarks.data);
    if (marksRes.status !== 200) throw new Error(`Expected 200 for marks, got ${marksRes.status}`);

    const marksMap = new Map(dMarks.data.map(m => [m.quizId, m]));
    if (marksMap.has(quizDraftId)) throw new Error('Draft quiz leaked into student marks');
    if (marksMap.has(quizUnenrolledId)) throw new Error('Unenrolled subject quiz leaked into student marks');

    const mMain = marksMap.get(quizMainId);
    if (
      !mMain ||
      Number(mMain.completedAttempts) !== 2 ||
      Number(mMain.bestScore) !== 3 ||
      Number(mMain.latestScore) !== 2 ||
      mMain.latestAttemptStatus !== 'IN_PROGRESS'
    ) {
      throw new Error(`Main quiz marks mismatch: ${JSON.stringify(mMain)}`);
    }

    const mNoAtt = marksMap.get(quizNoAttemptsId);
    if (
      !mNoAtt ||
      Number(mNoAtt.completedAttempts) !== 0 ||
      mNoAtt.bestScore !== null ||
      mNoAtt.latestScore !== null ||
      mNoAtt.latestAttemptStatus !== null
    ) {
      throw new Error(`No-attempt quiz marks mismatch (or leaked Student B attempt): ${JSON.stringify(mNoAtt)}`);
    }
    console.log('>>> STUDENT MARKS API PASSED <<<\n');

    // ========================================================
    // CHECKLIST 3: FACULTY RESULTS API
    // ========================================================
    console.log('--- FACULTY RESULTS API ---');
    const facRes = await fetch(`${FACULTY_API}/quizzes/${quizMainId}/results`, { headers: headersFacA });
    const dFac = await facRes.json();
    console.log(`Faculty A results status=${facRes.status}, summary=`, dFac.data?.summary);
    console.log('Faculty A results rows:', dFac.data?.results?.map(r => ({ attemptId: r.attemptId, status: r.status, score: r.score })));
    if (
      facRes.status !== 200 ||
      Number(dFac.data.summary.submittedAttempts) !== 2 ||
      Number(dFac.data.summary.manuallySubmittedAttempts) !== 1 ||
      Number(dFac.data.summary.autoSubmittedAttempts) !== 1 ||
      Number(dFac.data.summary.inProgressAttempts) !== 1 ||
      Number(dFac.data.summary.averageScore) !== 2.5 ||
      Number(dFac.data.summary.highestScore) !== 3 ||
      Number(dFac.data.summary.lowestScore) !== 2 ||
      dFac.data.results.length !== 2 ||
      !dFac.data.results.some(r => r.status === 'AUTO_SUBMITTED') ||
      dFac.data.results.some(r => r.status === 'IN_PROGRESS')
    ) {
      throw new Error(`Faculty results mismatch: ${JSON.stringify(dFac)}`);
    }

    const facOtherRes = await fetch(`${FACULTY_API}/quizzes/${quizMainId}/results`, { headers: headersFacB });
    const dFacOther = await facOtherRes.json();
    console.log(`Faculty B results status=${facOtherRes.status}`, dFacOther);
    if (facOtherRes.status !== 404) throw new Error(`Expected 404 for another faculty, got ${facOtherRes.status}`);
    console.log('>>> FACULTY RESULTS API PASSED <<<\n');

    console.log('ALL RESULT & MARKS CHECKLIST ITEMS PASSED SUCCESSFULLY!');
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

