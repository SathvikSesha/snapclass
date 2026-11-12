import {
  listStudentQuizzes,
  getStudentQuiz,
} from '../services/studentQuiz.service.js';
import { startStudentAttempt } from '../services/studentQuiz.service.js';
import {
  saveQuizAnswer,
} from '../services/studentQuiz.service.js';
import {
  submitQuizAttempt,
} from '../services/studentQuiz.service.js';
import {
  getQuizAttemptResult,
} from '../services/studentQuiz.service.js';
import {
  listStudentQuizMarks,
} from '../services/studentQuiz.service.js';

export async function listStudentQuizzesController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const quizzes = await listStudentQuizzes(userId);

    return res.status(200).json({
      success: true,
      data: quizzes,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentQuizController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const quiz = await getStudentQuiz(
      userId,
      req.params.quizId
    );

    return res.status(200).json({
      success: true,
      data: quiz,
    });
  } catch (error) {
    next(error);
  }
}


export async function startStudentAttemptController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const attempt = await startStudentAttempt(
      userId,
      req.params.quizId
    );

    return res.status(201).json({
      success: true,
      message: 'Quiz attempt started successfully',
      data: attempt,
    });
  } catch (error) {
    next(error);
  }
}

export async function saveStudentQuizAnswerController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const { questionId, selectedOptionId } = req.body;

    if (
      !Object.prototype.hasOwnProperty.call(
        req.body,
        'selectedOptionId'
      )
    ) {
      const error = new Error('selectedOptionId is required');
      error.statusCode = 400;
      throw error;
    }

    const answer = await saveQuizAnswer({
      userId,
      attemptId: req.params.attemptId,
      questionId,
      selectedOptionId,
    });

    return res.status(200).json({
      success: true,
      message: 'Answer saved successfully',
      data: answer,
    });
  } catch (error) {
    next(error);
  }
}

export async function submitStudentQuizAttemptController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const result = await submitQuizAttempt(
      userId,
      req.params.attemptId
    );

    return res.status(200).json({
      success: true,
      message:
        result.status === 'AUTO_SUBMITTED'
          ? 'Quiz attempt was automatically submitted because its time expired'
          : 'Quiz submitted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentQuizResultController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const result = await getQuizAttemptResult(
      userId,
      req.params.attemptId
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentQuizMarksController(req, res, next) {
  try {
    const userId = req.user.userId ?? req.user.sub;

    const marks = await listStudentQuizMarks(userId);

    return res.status(200).json({
      success: true,
      data: marks,
    });
  } catch (error) {
    next(error);
  }
}