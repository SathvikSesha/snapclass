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

export default router;
