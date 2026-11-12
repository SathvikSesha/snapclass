import {
    generateFacultyQuiz,
    saveFacultyQuizDraft,
} from '../services/facultyQuiz.service.js';
import {
    listFacultyQuizzes,
} from '../services/facultyQuiz.service.js';
import {
    getFacultyQuiz,
} from '../services/facultyQuiz.service.js';

import {
    editFacultyQuizDraft,
} from '../services/facultyQuiz.service.js';

import {
    publishFacultyQuiz,
    closeFacultyQuiz,
} from '../services/facultyQuiz.service.js';

export async function generateQuizController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const quiz = await generateFacultyQuiz({
            userId,
            subjectId: req.params.subjectId,
            documentIds: req.body.documentIds,
            numberOfQuestions: req.body.numberOfQuestions,
            difficulty: req.body.difficulty,
        });

        return res.status(200).json({
            success: true,
            message: 'Quiz generated successfully',
            data: quiz,
        });
    } catch (error) {
        next(error);
    }
}

export async function saveQuizDraftController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const result = await saveFacultyQuizDraft({
            userId,
            subjectId: req.params.subjectId,
            title: req.body.title,
            description: req.body.description,
            difficulty: req.body.difficulty,
            questions: req.body.questions,
        });

        return res.status(201).json({
            success: true,
            message: 'Quiz saved as draft successfully',
            data: result,
        });
    } catch (error) {
        next(error);
    }
}


export async function listFacultyQuizzesController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const quizzes = await listFacultyQuizzes({
            userId,
            status: req.query.status,
            subjectId: req.query.subjectId,
        });

        return res.status(200).json({
            success: true,
            data: {
                quizzes,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getFacultyQuizController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const result = await getFacultyQuiz({
            userId,
            quizId: req.params.quizId,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

export async function editFacultyQuizDraftController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const result = await editFacultyQuizDraft({
            userId,
            quizId: req.params.quizId,
            title: req.body.title,
            description: req.body.description,
            difficulty: req.body.difficulty,
            questions: req.body.questions,
        });

        return res.status(200).json({
            success: true,
            message: 'Quiz draft updated successfully',
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

export async function publishFacultyQuizController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const result = await publishFacultyQuiz({
            userId,
            quizId: req.params.quizId,
            startAt: req.body.startAt,
            deadlineAt: req.body.deadlineAt,
            durationMinutes: req.body.durationMinutes,
            maxAttempts: req.body.maxAttempts,
        });

        return res.status(200).json({
            success: true,
            message: 'Quiz published successfully',
            data: result,
        });
    } catch (error) {
        next(error);
    }
}


export async function closeFacultyQuizController(req, res, next) {
    try {
        const userId = Number(
            req.user.userId ?? req.user.sub
        );

        const result = await closeFacultyQuiz({
            userId,
            quizId: req.params.quizId,
        });

        return res.status(200).json({
            success: true,
            message: 'Quiz closed successfully',
            data: result,
        });
    } catch (error) {
        next(error);
    }
}