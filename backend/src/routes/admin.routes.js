import { Router } from 'express';
import { adminDashboard } from '../controllers/adminDashboard.controller.js';
import {
  createSubject,
  getSubjects,
  getSubjectRequests,
  reviewSubjectRequest,
} from '../controllers/adminSubjects.controller.js';
import { extractUser, requireAdmin } from '../middleware/auth.middleware.js';
import {
  getRegistrationWindowController,
  createRegistrationWindowController,
  updateRegistrationWindowController,
  getAllStudentsController,
  getStudentSubjectsController,
  getAllFacultyController,
  getFacultySubjectsController,
  removeStudentController,
  removeFacultyController,
} from '../controllers/admin.controller.js';


const router = Router();

router.use(extractUser);

router.get('/dashboard', requireAdmin, adminDashboard);
router.post('/subjects', requireAdmin, createSubject);
router.get('/subjects', requireAdmin, getSubjects);
router.get('/subject-requests', requireAdmin, getSubjectRequests);
router.patch('/subject-requests/:requestId', requireAdmin, reviewSubjectRequest);

router.put(
  '/registration-window/:id',
  requireAdmin,
  updateRegistrationWindowController
);

router.post(
  '/registration-window',
  requireAdmin,
  createRegistrationWindowController
);

router.get(
  '/registration-window',
  requireAdmin,
  getRegistrationWindowController
);

router.get('/students', requireAdmin, getAllStudentsController);

router.get(
  '/students/:studentId/subjects',
  requireAdmin,
  getStudentSubjectsController
);

router.get('/faculty', requireAdmin, getAllFacultyController);

router.get(
  '/faculty/:facultyId/subjects',
  requireAdmin,
  getFacultySubjectsController
);

router.delete(
  '/students/:accountId',
  requireAdmin,
  removeStudentController
);

router.delete(
  '/faculty/:accountId',
  requireAdmin,
  removeFacultyController
);

export default router;
