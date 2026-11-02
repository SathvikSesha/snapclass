import { Router } from 'express';
import { adminDashboard } from '../controllers/adminDashboard.controller.js';
import {
  createSubject,
  getSubjects,
  getSubjectRequests,
  reviewSubjectRequest,
} from '../controllers/adminSubjects.controller.js';
import { extractUser } from '../middleware/auth.middleware.js';

import {
  getRegistrationWindowController,
} from '../controllers/admin.controller.js';

import { requireAdmin } from '../middleware/auth.middleware.js';
import { createRegistrationWindowController } from '../controllers/admin.controller.js';
import { updateRegistrationWindowController } from '../controllers/admin.controller.js';

const router = Router();

router.use(extractUser);

router.get('/dashboard', adminDashboard);
router.post('/subjects', createSubject);
router.get('/subjects', getSubjects);
router.get('/subject-requests', getSubjectRequests);
router.patch('/subject-requests/:requestId', reviewSubjectRequest);

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


export default router;
