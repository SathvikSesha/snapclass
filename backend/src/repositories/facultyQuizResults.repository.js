
import { pool } from '../config/db.js';

export async function getFacultyQuizResults(userId, quizId) {
  // Verify quiz ownership.
  const [quizRows] = await pool.execute(
    `
    SELECT
      q.quiz_id AS quizId,
      q.title,
      q.description,
      q.status,
      q.total_marks AS totalMarks,
      q.max_attempts AS maxAttempts,
      q.start_at AS startAt,
      q.deadline_at AS deadlineAt,

      s.subject_code AS subjectCode,
      s.name AS subjectName

    FROM quizzes q
    JOIN faculty f
      ON f.faculty_id = q.faculty_id
    JOIN subjects s
      ON s.id = q.subject_id

    WHERE q.quiz_id = ?
      AND f.user_id = ?

    LIMIT 1
    `,
    [quizId, userId]
  );

  if (quizRows.length === 0) {
    return null;
  }

  const quiz = quizRows[0];

  // Count enrolled students and summarize their submitted results.
  const [summaryRows] = await pool.execute(
    `
    SELECT
      (
        SELECT COUNT(*)
        FROM subject_students ss
        WHERE ss.subject_id = q.subject_id
      ) AS totalEnrolledStudents,

      COUNT(
        CASE
          WHEN qa.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
          THEN qa.attempt_id
        END
      ) AS submittedAttempts,

      COUNT(
        CASE
          WHEN qa.status = 'SUBMITTED'
          THEN qa.attempt_id
        END
      ) AS manuallySubmittedAttempts,

      COUNT(
        CASE
          WHEN qa.status = 'AUTO_SUBMITTED'
          THEN qa.attempt_id
        END
      ) AS autoSubmittedAttempts,

      COUNT(
        CASE
          WHEN qa.status = 'IN_PROGRESS'
          THEN qa.attempt_id
        END
      ) AS inProgressAttempts,

      ROUND(AVG(
        CASE
          WHEN qa.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
          THEN qa.score
        END
      ), 2) AS averageScore,

      MAX(
        CASE
          WHEN qa.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
          THEN qa.score
        END
      ) AS highestScore,

      MIN(
        CASE
          WHEN qa.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
          THEN qa.score
        END
      ) AS lowestScore

    FROM quizzes q
    LEFT JOIN quiz_attempts qa
      ON qa.quiz_id = q.quiz_id

    WHERE q.quiz_id = ?

    GROUP BY q.quiz_id, q.subject_id
    `,
    [quizId]
  );

  // Return individual submitted attempts.
  const [attemptRows] = await pool.execute(
    `
    SELECT
      qa.attempt_id AS attemptId,
      qa.student_id AS studentId,
      qa.attempt_number AS attemptNumber,
      qa.status,
      qa.score,
      qa.total_marks AS totalMarks,
      qa.started_at AS startedAt,
      qa.submitted_at AS submittedAt

    FROM quiz_attempts qa
    WHERE qa.quiz_id = ?
      AND qa.status IN ('SUBMITTED', 'AUTO_SUBMITTED')

    ORDER BY qa.submitted_at DESC
    `,
    [quizId]
  );

  quiz.summary = summaryRows[0];
  quiz.results = attemptRows;

  return quiz;
}
