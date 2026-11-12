import { pool } from '../config/db.js';

export async function getStudentQuizzes(userId) {
  const [rows] = await pool.execute(
    `
    SELECT
      q.quiz_id AS quizId,
      q.title,
      q.description,
      q.status,
      q.difficulty,
      q.duration_minutes AS durationMinutes,
      q.max_attempts AS maxAttempts,
      q.total_marks AS totalMarks,
      q.start_at AS startAt,
      q.deadline_at AS deadlineAt,

      s.subject_code AS subjectCode,
      s.name AS subjectName,

      (
        SELECT COUNT(*)
        FROM quiz_questions qq
        WHERE qq.quiz_id = q.quiz_id
      ) AS totalQuestions,

      (
        SELECT COUNT(*)
        FROM quiz_attempts qa
        WHERE qa.quiz_id = q.quiz_id
          AND qa.student_id = st.student_id
      ) AS attemptsUsed,

      CASE
        WHEN q.status = 'CLOSED' THEN 'CLOSED'
        WHEN q.start_at > UTC_TIMESTAMP() THEN 'UPCOMING'
        WHEN q.deadline_at <= UTC_TIMESTAMP() THEN 'ENDED'
        ELSE 'AVAILABLE'
      END AS availabilityStatus

    FROM students st
    JOIN subject_students ss
      ON ss.student_id = st.student_id
    JOIN subjects s
      ON s.id = ss.subject_id
    JOIN quizzes q
      ON q.subject_id = s.id

    WHERE st.user_id = ?
      AND q.status IN ('PUBLISHED', 'CLOSED')

    ORDER BY q.start_at DESC
    `,
    [userId]
  );

  return rows;
}

export async function getStudentQuizDetails(userId, quizId) {
  const [quizRows] = await pool.execute(
    `
    SELECT
      q.quiz_id AS quizId,
      q.title,
      q.description,
      q.status,
      q.difficulty,
      q.duration_minutes AS durationMinutes,
      q.max_attempts AS maxAttempts,
      q.total_marks AS totalMarks,
      q.start_at AS startAt,
      q.deadline_at AS deadlineAt,

      s.subject_code AS subjectCode,
      s.name AS subjectName,

      CASE
        WHEN q.status = 'CLOSED' THEN 'CLOSED'
        WHEN q.start_at > UTC_TIMESTAMP() THEN 'UPCOMING'
        WHEN q.deadline_at <= UTC_TIMESTAMP() THEN 'ENDED'
        ELSE 'AVAILABLE'
      END AS availabilityStatus

    FROM quizzes q
    JOIN subjects s
      ON s.id = q.subject_id
    JOIN subject_students ss
      ON ss.subject_id = s.id
    JOIN students st
      ON st.student_id = ss.student_id

    WHERE q.quiz_id = ?
      AND st.user_id = ?
      AND q.status IN ('PUBLISHED', 'CLOSED')

    LIMIT 1
    `,
    [quizId, userId]
  );

  if (quizRows.length === 0) {
    return null;
  }

  const quiz = quizRows[0];

  const [questions] = await pool.execute(
    `
    SELECT
      qq.question_id AS questionId,
      qq.question_text AS question,
      qq.question_type AS questionType,
      qq.difficulty,
      qq.marks,
      qq.question_order AS questionOrder

    FROM quiz_questions qq
    WHERE qq.quiz_id = ?
    ORDER BY qq.question_order ASC
    `,
    [quizId]
  );

  const [options] = await pool.execute(
    `
    SELECT
      o.option_id AS optionId,
      o.question_id AS questionId,
      o.option_text AS optionText,
      o.option_order AS optionOrder

    FROM quiz_question_options o
    JOIN quiz_questions qq
      ON qq.question_id = o.question_id

    WHERE qq.quiz_id = ?
    ORDER BY qq.question_order, o.option_order
    `,
    [quizId]
  );

  const optionsByQuestion = new Map();

  for (const option of options) {
    if (!optionsByQuestion.has(option.questionId)) {
      optionsByQuestion.set(option.questionId, []);
    }

    optionsByQuestion.get(option.questionId).push({
      optionId: option.optionId,
      optionText: option.optionText,
      optionOrder: option.optionOrder,
    });
  }

  quiz.questions = questions.map((question) => ({
    ...question,
    options: optionsByQuestion.get(question.questionId) || [],
  }));

  return quiz;
}


export async function startStudentQuizAttempt(userId, quizId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the quiz row so concurrent start requests are serialized.
    const [quizRows] = await connection.execute(
      `
      SELECT
        quiz_id AS quizId,
        subject_id AS subjectId,
        title,
        duration_minutes AS durationMinutes,
        max_attempts AS maxAttempts,
        total_marks AS totalMarks,
        start_at AS startAt,
        deadline_at AS deadlineAt,
        status,
        (start_at <= UTC_TIMESTAMP()) AS hasStarted,
        (deadline_at > UTC_TIMESTAMP()) AS beforeDeadline
      FROM quizzes
      WHERE quiz_id = ?
      FOR UPDATE
      `,
      [quizId]
    );

    if (quizRows.length === 0) {
      const error = new Error('Quiz not found');
      error.statusCode = 404;
      throw error;
    }

    const quiz = quizRows[0];

    if (quiz.status !== 'PUBLISHED') {
      const error = new Error('This quiz is not available');
      error.statusCode = 409;
      throw error;
    }

    if (!quiz.hasStarted) {
      const error = new Error('This quiz has not started yet');
      error.statusCode = 409;
      throw error;
    }

    if (!quiz.beforeDeadline) {
      const error = new Error('The quiz deadline has passed');
      error.statusCode = 409;
      throw error;
    }

    if (!quiz.durationMinutes || !quiz.maxAttempts) {
      const error = new Error('Quiz configuration is invalid');
      error.statusCode = 409;
      throw error;
    }

    // Resolve the authenticated user to a student.
    const [studentRows] = await connection.execute(
      `
      SELECT student_id AS studentId
      FROM students
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length === 0) {
      const error = new Error('Student account not found');
      error.statusCode = 404;
      throw error;
    }

    const studentId = studentRows[0].studentId;

    // Verify subject enrollment.
    const [enrollmentRows] = await connection.execute(
      `
      SELECT 1
      FROM subject_students
      WHERE subject_id = ?
        AND student_id = ?
      LIMIT 1
      `,
      [quiz.subjectId, studentId]
    );

    if (enrollmentRows.length === 0) {
      const error = new Error('You are not enrolled in this subject');
      error.statusCode = 403;
      throw error;
    }

    // Check whether the student already has an active attempt.
    const [activeAttempts] = await connection.execute(
      `
      SELECT
        attempt_id AS attemptId,
        expires_at AS expiresAt
      FROM quiz_attempts
      WHERE quiz_id = ?
        AND student_id = ?
        AND status = 'IN_PROGRESS'
      FOR UPDATE
      `,
      [quizId, studentId]
    );

    for (const attempt of activeAttempts) {
      const [expiryRows] = await connection.execute(
        `
        SELECT (expires_at > UTC_TIMESTAMP()) AS isActive
        FROM quiz_attempts
        WHERE attempt_id = ?
        `,
        [attempt.attemptId]
      );

      if (expiryRows[0].isActive) {
        const error = new Error('You already have an active attempt');
        error.statusCode = 409;
        error.activeAttemptId = attempt.attemptId;
        throw error;
      }

      // An unfinished attempt whose timer has expired cannot be resumed.
      await connection.execute(
        `
        UPDATE quiz_attempts
        SET status = 'EXPIRED'
        WHERE attempt_id = ?
          AND status = 'IN_PROGRESS'
        `,
        [attempt.attemptId]
      );
    }

    // Count all attempts, including expired attempts.
    const [countRows] = await connection.execute(
      `
      SELECT
        COUNT(*) AS attemptsUsed,
        COALESCE(MAX(attempt_number), 0) AS lastAttemptNumber
      FROM quiz_attempts
      WHERE quiz_id = ?
        AND student_id = ?
      `,
      [quizId, studentId]
    );

    const { attemptsUsed, lastAttemptNumber } = countRows[0];

    if (Number(attemptsUsed) >= quiz.maxAttempts) {
      const error = new Error('Maximum quiz attempts reached');
      error.statusCode = 409;
      throw error;
    }

    const attemptNumber = Number(lastAttemptNumber) + 1;

    // Expiry is whichever comes first:
    // attempt duration or quiz deadline.
    const [insertResult] = await connection.execute(
      `
      INSERT INTO quiz_attempts (
        quiz_id,
        student_id,
        attempt_number,
        status,
        started_at,
        expires_at,
        total_marks
      )
      VALUES (
        ?,
        ?,
        ?,
        'IN_PROGRESS',
        UTC_TIMESTAMP(),
        LEAST(
          DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${Number(quiz.durationMinutes)} MINUTE),
          ?
        ),
        ?
      )
      `,
      [quizId, studentId, attemptNumber, quiz.deadlineAt, quiz.totalMarks]
    );

    const attemptId = insertResult.insertId;

    // Fetch questions without exposing correct answers or explanations.
    const [questions] = await connection.execute(
      `
      SELECT
        question_id AS questionId,
        question_text AS question,
        question_type AS questionType,
        difficulty,
        marks,
        question_order AS questionOrder
      FROM quiz_questions
      WHERE quiz_id = ?
      ORDER BY question_order ASC
      `,
      [quizId]
    );

    const [options] = await connection.execute(
      `
      SELECT
        o.option_id AS optionId,
        o.question_id AS questionId,
        o.option_text AS optionText,
        o.option_order AS optionOrder
      FROM quiz_question_options o
      JOIN quiz_questions qq
        ON qq.question_id = o.question_id
      WHERE qq.quiz_id = ?
      ORDER BY qq.question_order, o.option_order
      `,
      [quizId]
    );

    const optionsByQuestion = new Map();

    for (const option of options) {
      if (!optionsByQuestion.has(option.questionId)) {
        optionsByQuestion.set(option.questionId, []);
      }

      optionsByQuestion.get(option.questionId).push({
        optionId: option.optionId,
        optionText: option.optionText,
        optionOrder: option.optionOrder,
      });
    }

    const formattedQuestions = questions.map((question) => ({
      ...question,
      options: optionsByQuestion.get(question.questionId) || [],
    }));

    const [attemptRows] = await connection.execute(
      `
      SELECT
        started_at AS startedAt,
        expires_at AS expiresAt
      FROM quiz_attempts
      WHERE attempt_id = ?
      `,
      [attemptId]
    );

    await connection.commit();

    return {
      attemptId,
      attemptNumber,
      status: 'IN_PROGRESS',
      quiz: {
        quizId: quiz.quizId,
        title: quiz.title,
        durationMinutes: quiz.durationMinutes,
        totalMarks: quiz.totalMarks,
      },
      startedAt: attemptRows[0].startedAt,
      expiresAt: attemptRows[0].expiresAt,
      questions: formattedQuestions,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


export async function saveStudentQuizAnswer({
  userId,
  attemptId,
  questionId,
  selectedOptionId,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the attempt to prevent concurrent answer updates/submission.
    const [attemptRows] = await connection.execute(
      `
      SELECT
        qa.attempt_id AS attemptId,
        qa.status,
        (qa.expires_at > UTC_TIMESTAMP()) AS notExpired

      FROM quiz_attempts qa
      JOIN students st
        ON st.student_id = qa.student_id

      WHERE qa.attempt_id = ?
        AND st.user_id = ?

      FOR UPDATE
      `,
      [attemptId, userId]
    );

    if (attemptRows.length === 0) {
      const error = new Error('Quiz attempt not found');
      error.statusCode = 404;
      throw error;
    }

    const attempt = attemptRows[0];

    if (attempt.status !== 'IN_PROGRESS') {
      const error = new Error('This attempt is no longer active');
      error.statusCode = 409;
      throw error;
    }

    if (!attempt.notExpired) {
      const error = new Error('Your quiz attempt has expired');
      error.statusCode = 409;
      throw error;
    }

    // Verify that the question belongs to this attempt's quiz.
    const [questionRows] = await connection.execute(
      `
      SELECT qq.question_id
      FROM quiz_questions qq
      JOIN quiz_attempts qa
        ON qa.quiz_id = qq.quiz_id

      WHERE qa.attempt_id = ?
        AND qq.question_id = ?

      LIMIT 1
      `,
      [attemptId, questionId]
    );

    if (questionRows.length === 0) {
      const error = new Error('Question does not belong to this quiz');
      error.statusCode = 400;
      throw error;
    }

    // If an option was selected, verify that it belongs to this question.
    if (selectedOptionId !== null) {
      const [optionRows] = await connection.execute(
        `
        SELECT option_id
        FROM quiz_question_options
        WHERE option_id = ?
          AND question_id = ?
        LIMIT 1
        `,
        [selectedOptionId, questionId]
      );

      if (optionRows.length === 0) {
        const error = new Error('Invalid option for this question');
        error.statusCode = 400;
        throw error;
      }
    }

    const [updateResult] = await connection.execute(
      `
      UPDATE quiz_attempt_answers
      SET
        selected_option_id = ?,
        is_correct = NULL,
        marks_awarded = 0,
        answered_at = CASE
          WHEN ? IS NULL THEN NULL
          ELSE UTC_TIMESTAMP()
        END

      WHERE attempt_id = ?
        AND question_id = ?
      `,
      [
        selectedOptionId,
        selectedOptionId,
        attemptId,
        questionId,
      ]
    );

    if (updateResult.affectedRows === 0) {
      await connection.execute(
        `
        INSERT INTO quiz_attempt_answers (
          attempt_id,
          question_id,
          selected_option_id,
          is_correct,
          marks_awarded,
          answered_at
        )
        VALUES (
          ?,
          ?,
          ?,
          NULL,
          0,
          CASE
            WHEN ? IS NULL THEN NULL
            ELSE UTC_TIMESTAMP()
          END
        )
        `,
        [
          attemptId,
          questionId,
          selectedOptionId,
          selectedOptionId,
        ]
      );
    }

    const [savedRows] = await connection.execute(
      `
      SELECT
        question_id AS questionId,
        selected_option_id AS selectedOptionId,
        answered_at AS answeredAt

      FROM quiz_attempt_answers
      WHERE attempt_id = ?
        AND question_id = ?
      `,
      [attemptId, questionId]
    );

    await connection.commit();

    return savedRows[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


export async function submitStudentQuizAttempt(userId, attemptId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the attempt so answer updates and duplicate submissions
    // cannot race with the scoring operation.
    const [attemptRows] = await connection.execute(
      `
      SELECT
        qa.attempt_id AS attemptId,
        qa.status,
        qa.expires_at AS expiresAt,
        qa.total_marks AS totalMarks,
        (
          qa.expires_at <= UTC_TIMESTAMP()
        ) AS isExpired

      FROM quiz_attempts qa
      JOIN students st
        ON st.student_id = qa.student_id

      WHERE qa.attempt_id = ?
        AND st.user_id = ?

      FOR UPDATE
      `,
      [attemptId, userId]
    );

    if (attemptRows.length === 0) {
      const error = new Error('Quiz attempt not found');
      error.statusCode = 404;
      throw error;
    }

    const attempt = attemptRows[0];

    if (attempt.status !== 'IN_PROGRESS') {
      const error = new Error('This attempt has already been submitted');
      error.statusCode = 409;
      throw error;
    }

    const finalStatus = attempt.isExpired
      ? 'AUTO_SUBMITTED'
      : 'SUBMITTED';

    // Calculate correctness and marks entirely on the server.
    // Unanswered questions receive zero marks.
    await connection.execute(
      `
      UPDATE quiz_attempt_answers aa

      JOIN quiz_questions qq
        ON qq.question_id = aa.question_id

      LEFT JOIN quiz_question_options correct_option
        ON correct_option.question_id = qq.question_id
        AND correct_option.is_correct = TRUE

      SET
        aa.is_correct = (
          aa.selected_option_id IS NOT NULL
          AND aa.selected_option_id = correct_option.option_id
        ),

        aa.marks_awarded = CASE
          WHEN aa.selected_option_id IS NOT NULL
            AND aa.selected_option_id = correct_option.option_id
          THEN qq.marks
          ELSE 0
        END

      WHERE aa.attempt_id = ?
      `,
      [attemptId]
    );

    const [scoreRows] = await connection.execute(
      `
      SELECT COALESCE(SUM(marks_awarded), 0) AS score
      FROM quiz_attempt_answers
      WHERE attempt_id = ?
      `,
      [attemptId]
    );

    const score = scoreRows[0].score;

    await connection.execute(
      `
      UPDATE quiz_attempts
      SET
        status = ?,
        score = ?,
        submitted_at = UTC_TIMESTAMP()
      WHERE attempt_id = ?
        AND status = 'IN_PROGRESS'
      `,
      [finalStatus, score, attemptId]
    );

    const [resultRows] = await connection.execute(
      `
      SELECT
        attempt_id AS attemptId,
        attempt_number AS attemptNumber,
        status,
        score,
        total_marks AS totalMarks,
        started_at AS startedAt,
        expires_at AS expiresAt,
        submitted_at AS submittedAt

      FROM quiz_attempts
      WHERE attempt_id = ?
      `,
      [attemptId]
    );

    await connection.commit();

    return resultRows[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}