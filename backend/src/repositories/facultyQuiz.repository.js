import { pool } from '../config/db.js';

export async function getFacultySubjectContext(userId, subjectId) {
    const [rows] = await pool.execute(
        `
        SELECT
            f.faculty_id,
            s.id AS subject_id,
            s.subject_code
        FROM faculty f
        JOIN faculty_subjects fs
            ON fs.faculty_id = f.faculty_id
        JOIN subjects s
            ON s.id = fs.subject_id
        WHERE f.user_id = ?
          AND s.id = ?
        LIMIT 1
        `,
        [userId, subjectId]
    );

    return rows[0] || null;
}

export async function getCompletedSubjectMaterials(
    subjectId,
    documentIds
) {
    if (!documentIds.length) {
        return [];
    }

    const placeholders = documentIds.map(() => '?').join(', ');

    const [rows] = await pool.execute(
        `
        SELECT material_id
        FROM subject_materials
        WHERE subject_id = ?
          AND material_id IN (${placeholders})
          AND status = 'AVAILABLE'
          AND ingestion_status = 'COMPLETED'
        `,
        [subjectId, ...documentIds]
    );

    return rows;
}

export async function createQuizDraft({
    subjectId,
    facultyId,
    title,
    description,
    difficulty,
    totalMarks,
    questions,
}) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [quizResult] = await connection.execute(
            `
            INSERT INTO quizzes (
                subject_id,
                faculty_id,
                title,
                description,
                status,
                difficulty,
                total_marks
            )
            VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)
            `,
            [
                subjectId,
                facultyId,
                title,
                description,
                difficulty,
                totalMarks,
            ]
        );

        const quizId = quizResult.insertId;

        for (let index = 0; index < questions.length; index++) {
            const question = questions[index];

            const [questionResult] = await connection.execute(
                `
                INSERT INTO quiz_questions (
                    quiz_id,
                    question_text,
                    question_type,
                    explanation,
                    difficulty,
                    marks,
                    question_order,
                    source_document_id,
                    source_location
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    quizId,
                    question.question,
                    question.questionType,
                    question.explanation,
                    question.difficulty,
                    question.marks,
                    index + 1,
                    question.sourceDocumentId,
                    question.sourceLocation,
                ]
            );

            const questionId = questionResult.insertId;

            for (let optionIndex = 0;
                optionIndex < question.options.length;
                optionIndex++
            ) {
                const option = question.options[optionIndex];

                await connection.execute(
                    `
                    INSERT INTO quiz_question_options (
                        question_id,
                        option_text,
                        option_order,
                        is_correct
                    )
                    VALUES (?, ?, ?, ?)
                    `,
                    [
                        questionId,
                        option.text,
                        optionIndex + 1,
                        option.isCorrect ? 1 : 0,
                    ]
                );
            }
        }

        await connection.commit();

        return {
            quizId,
            totalQuestions: questions.length,
            totalMarks,
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getFacultyQuizzes({
    userId,
    status,
    subjectId,
}) {
    const conditions = ['f.user_id = ?'];
    const params = [userId];

    if (status) {
        conditions.push('q.status = ?');
        params.push(status);
    }

    if (subjectId) {
        conditions.push('q.subject_id = ?');
        params.push(subjectId);
    }

    const [rows] = await pool.execute(
        `
        SELECT
            q.quiz_id,
            q.subject_id,
            s.subject_code,
            s.name AS subject_name,
            q.title,
            q.description,
            q.status,
            q.difficulty,
            q.duration_minutes,
            q.max_attempts,
            q.total_marks,
            q.start_at,
            q.deadline_at,
            q.published_at,
            q.closed_at,
            q.created_at,

            COUNT(DISTINCT qq.question_id) AS total_questions

        FROM quizzes q

        JOIN faculty f
            ON f.faculty_id = q.faculty_id

        JOIN subjects s
            ON s.id = q.subject_id

        LEFT JOIN quiz_questions qq
            ON qq.quiz_id = q.quiz_id

        WHERE ${conditions.join(' AND ')}

        GROUP BY q.quiz_id

        ORDER BY q.created_at DESC
        `,
        params
    );

    return rows;
}

export async function getFacultyQuizDetails({
    userId,
    quizId,
}) {
    const [quizRows] = await pool.execute(
        `
        SELECT
            q.quiz_id,
            q.subject_id,
            s.subject_code,
            s.name AS subject_name,
            q.faculty_id,
            q.title,
            q.description,
            q.status,
            q.difficulty,
            q.duration_minutes,
            q.max_attempts,
            q.total_marks,
            q.start_at,
            q.deadline_at,
            q.published_at,
            q.closed_at,
            q.created_at,
            q.updated_at

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

    if (!quizRows.length) {
        return null;
    }

    const quiz = quizRows[0];

    const [questionRows] = await pool.execute(
        `
        SELECT
            qq.question_id,
            qq.question_text,
            qq.question_type,
            qq.explanation,
            qq.difficulty,
            qq.marks,
            qq.question_order,
            qq.source_document_id,
            qq.source_location,

            qo.option_id,
            qo.option_text,
            qo.option_order,
            qo.is_correct

        FROM quiz_questions qq

        LEFT JOIN quiz_question_options qo
            ON qo.question_id = qq.question_id

        WHERE qq.quiz_id = ?

        ORDER BY
            qq.question_order ASC,
            qo.option_order ASC
        `,
        [quizId]
    );

    return {
        quiz,
        questions: questionRows,
    };
}

export async function updateQuizDraft({
    userId,
    quizId,
    title,
    description,
    difficulty,
    totalMarks,
    questions,
}) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Lock the quiz and verify faculty ownership.
        const [quizRows] = await connection.execute(
            `
            SELECT q.quiz_id, q.status
            FROM quizzes q
            JOIN faculty f
                ON f.faculty_id = q.faculty_id
            WHERE q.quiz_id = ?
              AND f.user_id = ?
            FOR UPDATE
            `,
            [quizId, userId]
        );

        if (!quizRows.length) {
            const error = new Error('Quiz not found');
            error.statusCode = 404;
            throw error;
        }

        if (quizRows[0].status !== 'DRAFT') {
            const error = new Error(
                'Only draft quizzes can be edited'
            );
            error.statusCode = 409;
            throw error;
        }

        // Get existing question IDs.
        const [existingQuestions] = await connection.execute(
            `
            SELECT question_id
            FROM quiz_questions
            WHERE quiz_id = ?
            `,
            [quizId]
        );

        const existingIds = new Set(
            existingQuestions.map(row => Number(row.question_id))
        );

        const submittedIds = questions
            .filter(question => question.questionId != null)
            .map(question => Number(question.questionId));

        // Reject duplicate IDs.
        if (new Set(submittedIds).size !== submittedIds.length) {
            const error = new Error(
                'Duplicate question IDs are not allowed'
            );
            error.statusCode = 400;
            throw error;
        }

        // Reject IDs belonging to another quiz or nonexistent questions.
        for (const questionId of submittedIds) {
            if (!existingIds.has(questionId)) {
                const error = new Error(
                    `Question ${questionId} does not belong to this quiz`
                );
                error.statusCode = 400;
                throw error;
            }
        }

        await connection.execute(
            `
            UPDATE quizzes
            SET title = ?,
                description = ?,
                difficulty = ?,
                total_marks = ?
            WHERE quiz_id = ?
            `,
            [title, description, difficulty, totalMarks, quizId]
        );

        // Delete omitted questions.
        const retainedIds = new Set(submittedIds);

        const removedIds = [...existingIds].filter(
            id => !retainedIds.has(id)
        );

        if (removedIds.length > 0) {
            const placeholders = removedIds.map(() => '?').join(', ');

            await connection.execute(
                `
                DELETE FROM quiz_questions
                WHERE quiz_id = ?
                  AND question_id IN (${placeholders})
                `,
                [quizId, ...removedIds]
            );
        }

        await connection.execute(
            `
            UPDATE quiz_questions
            SET question_order = question_order + 1000
            WHERE quiz_id = ?
            `,
            [quizId]
        );

        // Update existing questions or insert new ones.
        for (let index = 0; index < questions.length; index++) {
            const question = questions[index];

            let questionId;

            if (question.questionId != null) {
                questionId = Number(question.questionId);

                await connection.execute(
                    `
                    UPDATE quiz_questions
                    SET question_text = ?,
                        question_type = ?,
                        explanation = ?,
                        difficulty = ?,
                        marks = ?,
                        question_order = ?,
                        source_document_id = ?,
                        source_location = ?
                    WHERE question_id = ?
                      AND quiz_id = ?
                    `,
                    [
                        question.question,
                        question.questionType,
                        question.explanation,
                        question.difficulty,
                        question.marks,
                        index + 1,
                        question.sourceDocumentId,
                        question.sourceLocation,
                        questionId,
                        quizId,
                    ]
                );

                // Replace options for the updated question.
                await connection.execute(
                    `
                    DELETE FROM quiz_question_options
                    WHERE question_id = ?
                    `,
                    [questionId]
                );
            } else {
                const [result] = await connection.execute(
                    `
                    INSERT INTO quiz_questions (
                        quiz_id,
                        question_text,
                        question_type,
                        explanation,
                        difficulty,
                        marks,
                        question_order,
                        source_document_id,
                        source_location
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        quizId,
                        question.question,
                        question.questionType,
                        question.explanation,
                        question.difficulty,
                        question.marks,
                        index + 1,
                        question.sourceDocumentId,
                        question.sourceLocation,
                    ]
                );

                questionId = result.insertId;
            }

            // Insert the final options.
            for (
                let optionIndex = 0;
                optionIndex < question.options.length;
                optionIndex++
            ) {
                const option = question.options[optionIndex];

                await connection.execute(
                    `
                    INSERT INTO quiz_question_options (
                        question_id,
                        option_text,
                        option_order,
                        is_correct
                    )
                    VALUES (?, ?, ?, ?)
                    `,
                    [
                        questionId,
                        option.text,
                        optionIndex + 1,
                        option.isCorrect ? 1 : 0,
                    ]
                );
            }
        }

        await connection.commit();

        return {
            quizId,
            totalQuestions: questions.length,
            totalMarks,
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function publishQuiz({
    userId,
    quizId,
    startAt,
    deadlineAt,
    durationMinutes,
    maxAttempts,
}) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `
            SELECT q.quiz_id, q.status
            FROM quizzes q
            JOIN faculty f
                ON f.faculty_id = q.faculty_id
            WHERE q.quiz_id = ?
              AND f.user_id = ?
            FOR UPDATE
            `,
            [quizId, userId]
        );

        if (!rows.length) {
            const error = new Error('Quiz not found');
            error.statusCode = 404;
            throw error;
        }

        if (rows[0].status !== 'DRAFT') {
            const error = new Error('Only draft quizzes can be published');
            error.statusCode = 409;
            throw error;
        }

        // Validate that the quiz contains questions and valid answer keys.
        const [questionRows] = await connection.execute(
            `
            SELECT
                qq.question_id,
                COUNT(qo.option_id) AS option_count,
                SUM(CASE WHEN qo.is_correct = 1 THEN 1 ELSE 0 END)
                    AS correct_count
            FROM quiz_questions qq
            LEFT JOIN quiz_question_options qo
                ON qo.question_id = qq.question_id
            WHERE qq.quiz_id = ?
            GROUP BY qq.question_id
            `,
            [quizId]
        );

        if (!questionRows.length) {
            const error = new Error('Cannot publish an empty quiz');
            error.statusCode = 400;
            throw error;
        }

        for (const question of questionRows) {
            if (
                Number(question.option_count) < 2 ||
                Number(question.correct_count) !== 1
            ) {
                const error = new Error(
                    'Every question must have at least two options and exactly one correct answer'
                );
                error.statusCode = 400;
                throw error;
            }
        }

        // Recalculate marks from the actual questions.
        const [markRows] = await connection.execute(
            `
            SELECT COALESCE(SUM(marks), 0) AS total_marks
            FROM quiz_questions
            WHERE quiz_id = ?
            `,
            [quizId]
        );

        const totalMarks = Number(markRows[0].total_marks);

        if (totalMarks <= 0) {
            const error = new Error('Quiz total marks must be greater than zero');
            error.statusCode = 400;
            throw error;
        }

        const [result] = await connection.execute(
            `
            UPDATE quizzes
            SET status = 'PUBLISHED',
                start_at = ?,
                deadline_at = ?,
                duration_minutes = ?,
                max_attempts = ?,
                total_marks = ?,
                published_at = UTC_TIMESTAMP(),
                closed_at = NULL
            WHERE quiz_id = ?
              AND status = 'DRAFT'
            `,
            [
                startAt,
                deadlineAt,
                durationMinutes,
                maxAttempts,
                totalMarks,
                quizId,
            ]
        );

        if (result.affectedRows !== 1) {
            const error = new Error('Quiz could not be published');
            error.statusCode = 409;
            throw error;
        }

        await connection.commit();

        return {
            quizId,
            status: 'PUBLISHED',
            totalMarks,
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function closeQuiz({ userId, quizId }) {
    const [result] = await pool.execute(
        `
        UPDATE quizzes q
        JOIN faculty f
            ON f.faculty_id = q.faculty_id
        SET q.status = 'CLOSED',
            q.closed_at = UTC_TIMESTAMP()
        WHERE q.quiz_id = ?
          AND f.user_id = ?
          AND q.status = 'PUBLISHED'
        `,
        [quizId, userId]
    );

    return result.affectedRows;
}