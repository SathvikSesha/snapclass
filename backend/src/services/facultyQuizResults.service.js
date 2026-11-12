
import {
  getFacultyQuizResults,
} from '../repositories/facultyQuizResults.repository.js';

function validateQuizId(quizId) {
  const id = Number(quizId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Invalid quiz ID');
    error.statusCode = 400;
    throw error;
  }

  return id;
}

export async function getFacultyQuizResultsService(userId, quizId) {
  const id = validateQuizId(quizId);

  const results = await getFacultyQuizResults(userId, id);

  if (!results) {
    const error = new Error('Quiz not found');
    error.statusCode = 404;
    throw error;
  }

  return results;
}
