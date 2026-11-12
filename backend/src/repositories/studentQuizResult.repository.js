
import { pool } from '../config/db.js';

export async function getStudentAttemptResult(userId, attemptId) {
  const [attemptRows] = await pool.execute(
    `
    SELECT
      qa.attempt_id AS attemptId,
      qa.quiz_id AS quizId,
      qa.attempt_number AS attemptNumber,
      qa.status,
      qa.score,
      qa.total_marks AS totalMarks,
      qa.started_at AS startedAt,
      qa.submitted_at AS submittedAt,

      q.title AS quizTitle,
      q.difficulty,
      q.duration_minutes AS durationMinutes,

      s.subject_code AS subjectCode,
      s.name AS subjectName

    FROM quiz_attempts qa
    JOIN students st
      ON st.student_id = qa.student_id
    JOIN quizzes q
      ON q.quiz_id = qa.quiz_id
    JOIN subjects s
      ON s.id = q.subject_id

    WHERE qa.attempt_id = ?
      AND st.user_id = ?

    LIMIT 1
    `,
    [attemptId, userId]
  );

  if (attemptRows.length === 0) {
    return null;
  }

  const result = attemptRows[0];

  if (!['SUBMITTED', 'AUTO_SUBMITTED'].includes(result.status)) {
    const error = new Error('Result is not available until submission');
    error.statusCode = 409;
    throw error;
  }

  const [rows] = await pool.execute(
    `
    SELECT
      qq.question_id AS questionId,
      qq.question_text AS question,
      qq.question_type AS questionType,
      qq.explanation,
      qq.difficulty,
      qq.marks,
      qq.question_order AS questionOrder,

      aa.selected_option_id AS selectedOptionId,
      aa.is_correct AS isCorrect,
      aa.marks_awarded AS marksAwarded,

      o.option_id AS optionId,
      o.option_text AS optionText,
      o.option_order AS optionOrder,
      o.is_correct AS isCorrectOption

    FROM quiz_attempt_answers aa
    JOIN quiz_questions qq
      ON qq.question_id = aa.question_id
    LEFT JOIN quiz_question_options o
      ON o.question_id = qq.question_id

    WHERE aa.attempt_id = ?

    ORDER BY qq.question_order, o.option_order
    `,
    [attemptId]
  );

  const questionsMap = new Map();

  for (const row of rows) {
    if (!questionsMap.has(row.questionId)) {
      questionsMap.set(row.questionId, {
        questionId: row.questionId,
        question: row.question,
        questionType: row.questionType,
        explanation: row.explanation,
        difficulty: row.difficulty,
        marks: row.marks,
        questionOrder: row.questionOrder,
        selectedOptionId: row.selectedOptionId,
        isCorrect: row.isCorrect,
        marksAwarded: row.marksAwarded,
        options: [],
      });
    }

    if (row.optionId !== null) {
      questionsMap.get(row.questionId).options.push({
        optionId: row.optionId,
        optionText: row.optionText,
        optionOrder: row.optionOrder,
        isCorrect: Boolean(row.isCorrectOption),
        isSelected: row.optionId === row.selectedOptionId,
      });
    }
  }

  result.questions = Array.from(questionsMap.values());

  result.correctAnswers = result.questions.filter(
    (question) => question.isCorrect
  ).length;

  result.incorrectAnswers = result.questions.filter(
    (question) => question.selectedOptionId !== null
      && !question.isCorrect
  ).length;

  result.unansweredQuestions = result.questions.filter(
    (question) => question.selectedOptionId === null
  ).length;

  return result;
}


export async function getStudentQuizMarks(userId) {
  const [rows] = await pool.execute(
    `
    SELECT
      q.quiz_id AS quizId,
      q.title AS quizTitle,
      q.total_marks AS totalMarks,
      q.max_attempts AS maxAttempts,

      s.subject_code AS subjectCode,
      s.name AS subjectName,

      COUNT(qa.attempt_id) AS completedAttempts,

      MAX(qa.score) AS bestScore,

      (
        SELECT latest.score
        FROM quiz_attempts latest
        WHERE latest.quiz_id = q.quiz_id
          AND latest.student_id = st.student_id
          AND latest.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
        ORDER BY latest.attempt_number DESC
        LIMIT 1
      ) AS latestScore,

      (
        SELECT latest.status
        FROM quiz_attempts latest
        WHERE latest.quiz_id = q.quiz_id
          AND latest.student_id = st.student_id
        ORDER BY latest.attempt_number DESC
        LIMIT 1
      ) AS latestAttemptStatus,

      (
        SELECT latest.submitted_at
        FROM quiz_attempts latest
        WHERE latest.quiz_id = q.quiz_id
          AND latest.student_id = st.student_id
        ORDER BY latest.attempt_number DESC
        LIMIT 1
      ) AS latestSubmittedAt

    FROM students st
    JOIN subject_students ss
      ON ss.student_id = st.student_id
    JOIN subjects s
      ON s.id = ss.subject_id
    JOIN quizzes q
      ON q.subject_id = s.id
    LEFT JOIN quiz_attempts qa
      ON qa.quiz_id = q.quiz_id
      AND qa.student_id = st.student_id
      AND qa.status IN ('SUBMITTED', 'AUTO_SUBMITTED')

    WHERE st.user_id = ?
      AND q.status IN ('PUBLISHED', 'CLOSED')

    GROUP BY
      st.student_id,
      q.quiz_id,
      q.title,
      q.total_marks,
      q.max_attempts,
      s.subject_code,
      s.name

    ORDER BY q.start_at DESC
    `,
    [userId]
  );

  return rows;
}
