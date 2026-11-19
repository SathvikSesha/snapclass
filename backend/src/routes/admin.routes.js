import { Router } from 'express';
import { adminDashboard } from '../controllers/adminDashboard.controller.js';
import {
  createSubject,
  getSubjects,
  getSubjectRequests,
  reviewSubjectRequest,
} from '../controllers/adminSubjects.controller.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
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

router.use(requireAdmin);

router.get('/dashboard', adminDashboard);
router.post('/subjects', createSubject);
router.get('/subjects', getSubjects);
router.get('/subject-requests', getSubjectRequests);
router.patch('/subject-requests/:requestId', reviewSubjectRequest);

router.put(
  '/registration-window/:id',
  updateRegistrationWindowController
);

router.post(
  '/registration-window',
  createRegistrationWindowController
);

router.get(
  '/registration-window',
  getRegistrationWindowController
);

router.get('/students', getAllStudentsController);

router.get(
  '/students/:studentId/subjects',
  getStudentSubjectsController
);

router.get('/faculty', getAllFacultyController);

router.get(
  '/faculty/:facultyId/subjects',
  getFacultySubjectsController
);

router.delete(
  '/students/:accountId',
  removeStudentController
);

router.delete(
  '/faculty/:accountId',
  removeFacultyController
);

export default router;
