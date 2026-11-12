import { Router } from 'express';

import {
  getStudentDashboardController,
  getStudentSubjectsController,
  registerForSubjectController,
  getStudentAttendanceController,
  getStudentAttendanceHistoryController,
} from '../controllers/student.controller.js';
import {
  listStudentQuizzesController,
  getStudentQuizController,
} from '../controllers/studentQuiz.controller.js';
import {
  startStudentAttemptController,
} from '../controllers/studentQuiz.controller.js';
import {
  saveStudentQuizAnswerController,
} from '../controllers/studentQuiz.controller.js';
import {
  submitStudentQuizAttemptController,
} from '../controllers/studentQuiz.controller.js';
import {
  getStudentQuizResultController,
} from '../controllers/studentQuiz.controller.js';
import {
  getStudentQuizMarksController,
} from '../controllers/studentQuiz.controller.js';

import { requireStudent } from '../middleware/auth.middleware.js';

const router = Router();

router.get(
  '/dashboard',
  requireStudent,
  getStudentDashboardController
);

router.get(
  '/subjects',
  requireStudent,
  getStudentSubjectsController
);

router.post(
  '/subjects/:subjectId/register',
  requireStudent,
  registerForSubjectController
);


router.get(
  '/subjects/:subjectId/attendance',
  requireStudent,
  getStudentAttendanceController
);

router.get(
  '/subjects/:subjectId/attendance/history',
  requireStudent,
  getStudentAttendanceHistoryController
);

router.get('/quizzes',requireStudent, listStudentQuizzesController);

router.get('/quizzes/:quizId',requireStudent, getStudentQuizController);

router.post(
  '/quizzes/:quizId/attempts',
  requireStudent,
  startStudentAttemptController
);

router.put(
  '/quiz-attempts/:attemptId/answers',
  requireStudent,
  saveStudentQuizAnswerController
);
router.post(
  '/quiz-attempts/:attemptId/submit',
  requireStudent,
  submitStudentQuizAttemptController
);

router.get(
  '/quiz-attempts/:attemptId/result',
  requireStudent,
  getStudentQuizResultController
);

router.get(
  '/marks/quizzes',
  requireStudent,
  getStudentQuizMarksController
);


export default router;
