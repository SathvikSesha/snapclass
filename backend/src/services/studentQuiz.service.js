import {
  getStudentQuizzes,
  getStudentQuizDetails,
  startStudentQuizAttempt,
  saveStudentQuizAnswer,
  submitStudentQuizAttempt,
} from '../repositories/studentQuiz.repository.js';
import {
  getStudentAttemptResult,
  getStudentQuizMarks,
} from '../repositories/studentQuizResult.repository.js';

function validateQuizId(quizId) {
  const id = Number(quizId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Invalid quiz ID');
    error.statusCode = 400;
    throw error;
  }

  return id;
}

export async function listStudentQuizzes(userId) {
  return getStudentQuizzes(userId);
}

export async function getStudentQuiz(userId, quizId) {
  const id = validateQuizId(quizId);

  const quiz = await getStudentQuizDetails(userId, id);

  if (!quiz) {
    const error = new Error('Quiz not found');
    error.statusCode = 404;
    throw error;
  }

  return quiz;
}


export async function startStudentAttempt(userId, quizId) {
  const id = validateQuizId(quizId);

  return startStudentQuizAttempt(userId, id);
}

function validatePositiveId(value, fieldName) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }

  return id;
}

export async function saveQuizAnswer({
  userId,
  attemptId,
  questionId,
  selectedOptionId,
}) {
  const validatedAttemptId = validatePositiveId(
    attemptId,
    'attempt ID'
  );

  const validatedQuestionId = validatePositiveId(
    questionId,
    'question ID'
  );

  // null is explicitly supported for clearing an answer.
  const validatedOptionId =
    selectedOptionId === null
      ? null
      : validatePositiveId(selectedOptionId, 'option ID');

  return saveStudentQuizAnswer({
    userId,
    attemptId: validatedAttemptId,
    questionId: validatedQuestionId,
    selectedOptionId: validatedOptionId,
  });
}


export async function submitQuizAttempt(userId, attemptId) {
  const id = validatePositiveId(attemptId, 'attempt ID');

  return submitStudentQuizAttempt(userId, id);
}

export async function getQuizAttemptResult(userId, attemptId) {
  const id = validatePositiveId(attemptId, 'attempt ID');

  const result = await getStudentAttemptResult(userId, id);

  if (!result) {
    const error = new Error('Quiz attempt not found');
    error.statusCode = 404;
    throw error;
  }

  return result;
}

export async function listStudentQuizMarks(userId) {
  return getStudentQuizMarks(userId);
}