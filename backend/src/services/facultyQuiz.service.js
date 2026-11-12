import { generateQuiz } from './ai-client.service.js';
import {
    getFacultySubjectContext,
    getCompletedSubjectMaterials,
    createQuizDraft,
} from '../repositories/facultyQuiz.repository.js';
import {
    getFacultyQuizzes,
    getFacultyQuizDetails,
} from '../repositories/facultyQuiz.repository.js';
import {
    updateQuizDraft,
} from '../repositories/facultyQuiz.repository.js';
import {
    publishQuiz,
    closeQuiz,
} from '../repositories/facultyQuiz.repository.js';

function createError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

export async function generateFacultyQuiz({
    userId,
    subjectId,
    documentIds,
    numberOfQuestions,
    difficulty,
}) {
    const parsedSubjectId = Number(subjectId);

    if (!Number.isSafeInteger(parsedSubjectId) || parsedSubjectId <= 0) {
        throw createError('Invalid subject ID', 400);
    }

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw createError(
            'Select at least one indexed material',
            400
        );
    }

    const normalizedDocumentIds = [
        ...new Set(documentIds.map(Number)),
    ];

    if (
        normalizedDocumentIds.some(
            id => !Number.isSafeInteger(id) || id <= 0
        )
    ) {
        throw createError('Invalid document IDs', 400);
    }

    if (normalizedDocumentIds.length > 20) {
        throw createError('Select at most 20 documents', 400);
    }

    const count = Number(numberOfQuestions ?? 5);

    if (!Number.isInteger(count) || count < 1 || count > 20) {
        throw createError(
            'Number of questions must be between 1 and 20',
            400
        );
    }

    const allowedDifficulties = [
        'easy',
        'medium',
        'hard',
        'mixed',
    ];

    const normalizedDifficulty = String(
        difficulty ?? 'mixed'
    ).toLowerCase();

    if (!allowedDifficulties.includes(normalizedDifficulty)) {
        throw createError('Invalid difficulty level', 400);
    }

    // 1. Verify faculty assignment.
    const subject = await getFacultySubjectContext(
        userId,
        parsedSubjectId
    );

    if (!subject) {
        throw createError(
            'You are not assigned to this subject',
            403
        );
    }

    // 2. Verify all selected materials are indexed.
    const materials = await getCompletedSubjectMaterials(
        parsedSubjectId,
        normalizedDocumentIds
    );

    if (materials.length !== normalizedDocumentIds.length) {
        throw createError(
            'Some selected materials are unavailable or not indexed',
            400
        );
    }

    // 3. Call AI service using subject_id and material IDs (matching ingestion worker format).
    const quiz = await generateQuiz({
        subjectCode: String(subject.subject_id),
        documentIds: normalizedDocumentIds,
        numberOfQuestions: count,
        difficulty: normalizedDifficulty,
    });

    return quiz;
}

function validateDraftQuestion(question, index) {
    const position = index + 1;

    if (
        !question ||
        typeof question.question !== 'string' ||
        !question.question.trim() ||
        question.question.trim().length > 65535
    ) {
        throw createError(
            `Question ${position} has invalid question text`,
            400
        );
    }

    const questionType = String(
        question.questionType || 'MCQ'
    ).toUpperCase();

    if (!['MCQ', 'TRUE_FALSE'].includes(questionType)) {
        throw createError(
            `Question ${position} has an invalid question type`,
            400
        );
    }

    if (
        !Array.isArray(question.options) ||
        question.options.length < 2 ||
        question.options.length > 6
    ) {
        throw createError(
            `Question ${position} must have between 2 and 6 options`,
            400
        );
    }

    if (
        questionType === 'TRUE_FALSE' &&
        question.options.length !== 2
    ) {
        throw createError(
            `Question ${position} must have exactly 2 options`,
            400
        );
    }

    let correctCount = 0;
    const optionTexts = new Set();

    for (const option of question.options) {
        if (
            !option ||
            typeof option.text !== 'string' ||
            !option.text.trim() ||
            option.text.trim().length > 1000
        ) {
            throw createError(
                `Question ${position} contains an invalid option`,
                400
            );
        }

        const normalizedText = option.text.trim().toLowerCase();

        if (optionTexts.has(normalizedText)) {
            throw createError(
                `Question ${position} contains duplicate options`,
                400
            );
        }

        optionTexts.add(normalizedText);

        if (typeof option.isCorrect !== 'boolean') {
            throw createError(
                `Question ${position} has an invalid answer configuration`,
                400
            );
        }

        if (option.isCorrect) correctCount++;
    }

    if (correctCount !== 1) {
        throw createError(
            `Question ${position} must have exactly one correct answer`,
            400
        );
    }

    const difficulty = String(
        question.difficulty || 'MEDIUM'
    ).toUpperCase();

    if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
        throw createError(
            `Question ${position} has invalid difficulty`,
            400
        );
    }

    const marks = Number(question.marks ?? 1);

    if (
        !Number.isFinite(marks) ||
        marks <= 0 ||
        marks > 9999.99 ||
        Math.round(marks * 100) !== marks * 100
    ) {
        throw createError(
            `Question ${position} has invalid marks`,
            400
        );
    }

    const explanation = question.explanation ?? null;

    if (
        explanation !== null &&
        (typeof explanation !== 'string' || explanation.length > 65535)
    ) {
        throw createError(
            `Question ${position} has invalid explanation`,
            400
        );
    }

    const sourceDocumentId = question.sourceDocumentId == null
        ? null
        : String(question.sourceDocumentId);

    const sourceLocation = question.sourceLocation ?? null;

    if (
        sourceDocumentId !== null &&
        (!sourceDocumentId.trim() || sourceDocumentId.length > 100)
    ) {
        throw createError(
            `Question ${position} has an invalid source document ID`,
            400
        );
    }

    if (
        sourceLocation !== null &&
        (typeof sourceLocation !== 'string' || sourceLocation.length > 255)
    ) {
        throw createError(
            `Question ${position} has an invalid source location`,
            400
        );
    }

    return {
        question: question.question.trim(),
        questionType,
        options: question.options.map(option => ({
            text: option.text.trim(),
            isCorrect: option.isCorrect,
        })),
        explanation,
        difficulty,
        marks,
        sourceDocumentId,
        sourceLocation,
    };
}

export async function saveFacultyQuizDraft({
    userId,
    subjectId,
    title,
    description,
    difficulty,
    questions,
}) {
    const parsedSubjectId = Number(subjectId);

    if (
        !Number.isSafeInteger(parsedSubjectId) ||
        parsedSubjectId <= 0
    ) {
        throw createError('Invalid subject ID', 400);
    }

    if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > 255
    ) {
        throw createError('Quiz title is required (maximum 255 characters)', 400);
    }

    if (
        description != null &&
        (typeof description !== 'string' || description.length > 65535)
    ) {
        throw createError('Invalid quiz description', 400);
    }

    const normalizedDifficulty = String(
        difficulty || 'MIXED'
    ).toUpperCase();

    if (
        !['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(
            normalizedDifficulty
        )
    ) {
        throw createError('Invalid quiz difficulty', 400);
    }

    if (
        !Array.isArray(questions) ||
        questions.length < 1 ||
        questions.length > 50
    ) {
        throw createError(
            'A quiz must contain between 1 and 50 questions',
            400
        );
    }

    // Verify that the requesting faculty owns this subject.
    const subject = await getFacultySubjectContext(
        userId,
        parsedSubjectId
    );

    if (!subject) {
        throw createError(
            'You are not assigned to this subject',
            403
        );
    }

    const validatedQuestions = questions.map(
        (question, index) => validateDraftQuestion(question, index)
    );

    // Verify source document references belong to this subject.
    const sourceIds = [
        ...new Set(
            validatedQuestions
                .map(question => question.sourceDocumentId)
                .filter(Boolean)
        ),
    ];

    if (sourceIds.length > 0) {
        const numericSourceIds = sourceIds.map(Number);

        if (
            numericSourceIds.some(
                id => !Number.isSafeInteger(id) || id <= 0
            )
        ) {
            throw createError('Invalid source document reference', 400);
        }

        const materials = await getCompletedSubjectMaterials(
            parsedSubjectId,
            numericSourceIds
        );

        if (materials.length !== sourceIds.length) {
            throw createError(
                'One or more question source documents are not indexed for this subject',
                400
            );
        }
    }

    const totalMarks = Number(
        validatedQuestions
            .reduce((sum, question) => sum + question.marks, 0)
            .toFixed(2)
    );

    return createQuizDraft({
        subjectId: parsedSubjectId,
        facultyId: subject.faculty_id,
        title: title.trim(),
        description: description?.trim() || null,
        difficulty: normalizedDifficulty,
        totalMarks,
        questions: validatedQuestions,
    });
}

export async function listFacultyQuizzes({
    userId,
    status,
    subjectId,
}) {
    const allowedStatuses = [
        'DRAFT',
        'PUBLISHED',
        'CLOSED',
    ];

    let normalizedStatus = null;

    if (status) {
        normalizedStatus = String(status).toUpperCase();

        if (!allowedStatuses.includes(normalizedStatus)) {
            throw createError('Invalid quiz status', 400);
        }
    }

    let normalizedSubjectId = null;

    if (subjectId !== undefined) {
        normalizedSubjectId = Number(subjectId);

        if (
            !Number.isSafeInteger(normalizedSubjectId) ||
            normalizedSubjectId <= 0
        ) {
            throw createError('Invalid subject ID', 400);
        }
    }

    const rows = await getFacultyQuizzes({
        userId,
        status: normalizedStatus,
        subjectId: normalizedSubjectId,
    });

    return rows.map(quiz => ({
        quizId: quiz.quiz_id,
        subjectId: quiz.subject_id,
        subjectCode: quiz.subject_code,
        subjectName: quiz.subject_name,
        title: quiz.title,
        description: quiz.description,
        status: quiz.status,
        difficulty: quiz.difficulty,
        totalQuestions: Number(quiz.total_questions),
        totalMarks: Number(quiz.total_marks),
        durationMinutes: quiz.duration_minutes,
        maxAttempts: quiz.max_attempts,
        startAt: quiz.start_at,
        deadlineAt: quiz.deadline_at,
        publishedAt: quiz.published_at,
        closedAt: quiz.closed_at,
        createdAt: quiz.created_at,
    }));
}


export async function getFacultyQuiz({
    userId,
    quizId,
}) {
    const parsedQuizId = Number(quizId);

    if (
        !Number.isSafeInteger(parsedQuizId) ||
        parsedQuizId <= 0
    ) {
        throw createError('Invalid quiz ID', 400);
    }

    const result = await getFacultyQuizDetails({
        userId,
        quizId: parsedQuizId,
    });

    if (!result) {
        throw createError('Quiz not found', 404);
    }

    const { quiz, questions } = result;

    const questionMap = new Map();

    for (const row of questions) {
        if (!questionMap.has(row.question_id)) {
            questionMap.set(row.question_id, {
                questionId: row.question_id,
                question: row.question_text,
                questionType: row.question_type,
                explanation: row.explanation,
                difficulty: row.difficulty,
                marks: Number(row.marks),
                questionOrder: row.question_order,
                sourceDocumentId: row.source_document_id,
                sourceLocation: row.source_location,
                options: [],
            });
        }

        if (row.option_id !== null) {
            questionMap.get(row.question_id).options.push({
                optionId: row.option_id,
                text: row.option_text,
                optionOrder: row.option_order,
                isCorrect: Boolean(row.is_correct),
            });
        }
    }

    return {
        quiz: {
            quizId: quiz.quiz_id,
            subjectId: quiz.subject_id,
            subjectCode: quiz.subject_code,
            subjectName: quiz.subject_name,
            title: quiz.title,
            description: quiz.description,
            status: quiz.status,
            difficulty: quiz.difficulty,
            durationMinutes: quiz.duration_minutes,
            maxAttempts: quiz.max_attempts,
            totalMarks: Number(quiz.total_marks),
            startAt: quiz.start_at,
            deadlineAt: quiz.deadline_at,
            publishedAt: quiz.published_at,
            closedAt: quiz.closed_at,
            createdAt: quiz.created_at,
            updatedAt: quiz.updated_at,
        },

        questions: Array.from(questionMap.values()),
    };
}

export async function editFacultyQuizDraft({
    userId,
    quizId,
    title,
    description,
    difficulty,
    questions,
}) {
    const parsedQuizId = Number(quizId);

    if (
        !Number.isSafeInteger(parsedQuizId) ||
        parsedQuizId <= 0
    ) {
        throw createError('Invalid quiz ID', 400);
    }

    if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > 255
    ) {
        throw createError('Quiz title is required (maximum 255 characters)', 400);
    }

    if (
        description != null &&
        (typeof description !== 'string' || description.length > 65535)
    ) {
        throw createError('Invalid quiz description', 400);
    }

    const normalizedDifficulty = String(
        difficulty || 'MIXED'
    ).toUpperCase();

    if (
        !['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(
            normalizedDifficulty
        )
    ) {
        throw createError('Invalid quiz difficulty', 400);
    }

    if (
        !Array.isArray(questions) ||
        questions.length < 1 ||
        questions.length > 50
    ) {
        throw createError(
            'A quiz must contain between 1 and 50 questions',
            400
        );
    }

    const validatedQuestions = questions.map((question, index) => {
        if (question.questionId != null) {
            const questionId = Number(question.questionId);

            if (
                !Number.isSafeInteger(questionId) ||
                questionId <= 0
            ) {
                throw createError(
                    `Question ${index + 1} has an invalid question ID`,
                    400
                );
            }
        }

        return {
            ...validateDraftQuestion(question, index),
            questionId: question.questionId == null
                ? null
                : Number(question.questionId),
        };
    });

    // Validate that all referenced source documents are indexed
    // and belong to this subject.
    const sourceIds = [
        ...new Set(
            validatedQuestions
                .map(question => question.sourceDocumentId)
                .filter(Boolean)
        ),
    ];

    if (sourceIds.length > 0) {
        const numericSourceIds = sourceIds.map(Number);

        if (
            numericSourceIds.some(
                id => !Number.isSafeInteger(id) || id <= 0
            )
        ) {
            throw createError('Invalid source document reference', 400);
        }

        // Resolve quiz subject through the existing faculty-owned quiz.
        const quizDetails = await getFacultyQuizDetails({
            userId,
            quizId: parsedQuizId,
        });

        if (!quizDetails) {
            throw createError('Quiz not found', 404);
        }

        const materials = await getCompletedSubjectMaterials(
            quizDetails.quiz.subject_id,
            numericSourceIds
        );

        if (materials.length !== sourceIds.length) {
            throw createError(
                'One or more source documents are not indexed for this subject',
                400
            );
        }
    }

    const totalMarks = Number(
        validatedQuestions
            .reduce((sum, question) => sum + question.marks, 0)
            .toFixed(2)
    );

    return updateQuizDraft({
        userId,
        quizId: parsedQuizId,
        title: title.trim(),
        description: description?.trim() || null,
        difficulty: normalizedDifficulty,
        totalMarks,
        questions: validatedQuestions,
    });
}

function parseDateToMySQLUtc(value, fieldName) {
    if (typeof value !== 'string' || !value.trim()) {
        throw createError(`${fieldName} is required`, 400);
    }

    // Require an explicit timezone to avoid server-local timezone ambiguity.
    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

    if (!hasTimezone) {
        throw createError(
            `${fieldName} must include a timezone, preferably UTC (Z)`,
            400
        );
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw createError(`${fieldName} is invalid`, 400);
    }

    // MySQL DATETIME stores a timezone-less value.
    // We consistently store UTC.
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

export async function publishFacultyQuiz({
    userId,
    quizId,
    startAt,
    deadlineAt,
    durationMinutes,
    maxAttempts,
}) {
    const parsedQuizId = Number(quizId);

    if (!Number.isSafeInteger(parsedQuizId) || parsedQuizId <= 0) {
        throw createError('Invalid quiz ID', 400);
    }

    const start = parseDateToMySQLUtc(startAt, 'Start time');
    const deadline = parseDateToMySQLUtc(deadlineAt, 'Deadline');

    const startDate = new Date(`${start.replace(' ', 'T')}Z`);
    const deadlineDate = new Date(`${deadline.replace(' ', 'T')}Z`);

    if (startDate.getTime() <= Date.now()) {
        throw createError('Start time must be in the future', 400);
    }

    if (deadlineDate.getTime() <= startDate.getTime()) {
        throw createError('Deadline must be after the start time', 400);
    }

    const duration = Number(durationMinutes);
    const attempts = Number(maxAttempts);

    if (
        !Number.isInteger(duration) ||
        duration < 1 ||
        duration > 1440
    ) {
        throw createError(
            'Duration must be between 1 and 1440 minutes',
            400
        );
    }

    if (
        !Number.isInteger(attempts) ||
        attempts < 1 ||
        attempts > 5
    ) {
        throw createError(
            'Maximum attempts must be between 1 and 5',
            400
        );
    }

    return publishQuiz({
        userId,
        quizId: parsedQuizId,
        startAt: start,
        deadlineAt: deadline,
        durationMinutes: duration,
        maxAttempts: attempts,
    });
}

export async function closeFacultyQuiz({ userId, quizId }) {
    const parsedQuizId = Number(quizId);

    if (!Number.isSafeInteger(parsedQuizId) || parsedQuizId <= 0) {
        throw createError('Invalid quiz ID', 400);
    }

    const affectedRows = await closeQuiz({
        userId,
        quizId: parsedQuizId,
    });

    if (!affectedRows) {
        throw createError(
            'Quiz not found or it is not currently published',
            404
        );
    }

    return {
        quizId: parsedQuizId,
        status: 'CLOSED',
    };
}