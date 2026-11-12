import { Router } from 'express';

import {
  listSubjectMaterials,
  downloadSubjectMaterial,
} from '../controllers/materials.controller.js';

import {
  requireFacultyOrStudent,
} from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireFacultyOrStudent);

router.get(
  '/subjects/:subjectId/materials',
  listSubjectMaterials
);

router.get(
  '/materials/:materialId/download',
  downloadSubjectMaterial
);

export default router;