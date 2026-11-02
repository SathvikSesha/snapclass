import { Router } from 'express';

import {
  getStudentDashboardController,
  getStudentSubjectsController,
  registerForSubjectController,
  getStudentAttendanceController,
  getStudentAttendanceHistoryController,
} from '../controllers/student.controller.js';

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


export default router;
