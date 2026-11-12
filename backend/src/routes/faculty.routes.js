import { Router } from 'express';
import { requireFaculty } from '../middleware/auth.middleware.js';
import { facultyDashboard } from '../controllers/facultyDashboard.controller.js';
import {
  getFacultySubjectsController,
  requestSubjectAccessController,
} from '../controllers/facultySubjects.controller.js';
import {
  getFacultyAttendanceDatesController,
  getFacultyAttendanceStudentsController
} from '../controllers/facultyAttendance.controller.js';
import { recognizeAttendanceFacesController } from '../controllers/facultyAttendanceRecognition.controller.js';
import { attendanceImagesUpload } from '../middleware/upload.js';
import { saveFacultyAttendanceController } from '../controllers/facultyAttendance.controller.js';
import {
  createMaterialUpload,
  completeMaterialUploadController,
} from '../controllers/facultyMaterials.controller.js';

import {
    generateQuizController,
    saveQuizDraftController,
    listFacultyQuizzesController,
    getFacultyQuizController,
    editFacultyQuizDraftController,
    publishFacultyQuizController,
    closeFacultyQuizController,
} from '../controllers/facultyQuiz.controller.js';

const router = Router();

router.get('/dashboard', requireFaculty, facultyDashboard);
router.get('/subjects', requireFaculty, getFacultySubjectsController);
router.post('/subjects/:subjectId/request', requireFaculty, requestSubjectAccessController);
router.get(
  '/subjects/:subjectId/attendance/dates',
  requireFaculty,
  getFacultyAttendanceDatesController
);

router.get(
  '/subjects/:subjectId/attendance',
  requireFaculty,
  getFacultyAttendanceStudentsController
);

router.post(
  '/subjects/:subjectId/attendance/recognize',
  requireFaculty,
  attendanceImagesUpload,
  recognizeAttendanceFacesController
);

router.post(
  '/subjects/:subjectId/attendance/save',
  requireFaculty,
  saveFacultyAttendanceController
);

router.post(
  '/subjects/:subjectId/materials',
  requireFaculty,
  createMaterialUpload
);

router.post(
  '/materials/:materialId/complete',
  requireFaculty,
  completeMaterialUploadController
);

router.post(
  '/subjects/:subjectId/quizzes/generate',
  requireFaculty,
  generateQuizController
);


router.post(
    '/subjects/:subjectId/quizzes',
    requireFaculty,
    saveQuizDraftController
);

router.get(
    '/quizzes',
    requireFaculty,
    listFacultyQuizzesController
);

router.get(
    '/quizzes/:quizId',
    requireFaculty,
    getFacultyQuizController
);

router.patch(
    '/quizzes/:quizId',
    requireFaculty,
    editFacultyQuizDraftController
);

router.post(
    '/quizzes/:quizId/publish',
    requireFaculty,
    publishFacultyQuizController
);

router.post(
    '/quizzes/:quizId/close',
    requireFaculty,
    closeFacultyQuizController
);

export default router;
