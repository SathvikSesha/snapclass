import { getFacultyQuizResultsService } from '../services/facultyQuizResults.service.js';

export async function getFacultyQuizResultsController(req, res, next) {
  try {
    const userId = Number(req.user.userId ?? req.user.sub);

    const results = await getFacultyQuizResultsService(
      userId,
      req.params.quizId
    );

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
}

