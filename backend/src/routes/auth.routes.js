import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { registerAdminController } from '../controllers/auth.controller.js';
import {
  sendEmailVerificationOtpController,
  verifyEmailController,
} from '../controllers/auth.controller.js';

import {
  studentFaceLoginController,
} from '../controllers/student.controller.js';

import {
  adminLoginController,
  verifyAdminMfaController,
} from '../controllers/auth.controller.js';

import {
  registerFacultyController,
  facultyLoginController,
  verifyFacultyMfaController,
} from '../controllers/auth.controller.js';

import { registerStudentController } from '../controllers/student.controller.js';
import { studentFaceUpload } from '../middleware/student-upload.js';

import {
  studentLoginController,
  verifyStudentMfaController,
} from '../controllers/student.controller.js';

const router = Router();

const adminRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const sendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const studentRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/faculty/register',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  registerFacultyController
);

router.post(
  '/faculty/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  facultyLoginController
);

router.post(
  '/faculty/verify-mfa',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  verifyFacultyMfaController
);

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminMfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/admin/login', adminLoginLimiter, adminLoginController);

router.post(
  '/admin/verify-mfa',
  adminMfaLimiter,
  verifyAdminMfaController
);

router.post(
  '/send-email-verification-otp',
  sendOtpLimiter,
  sendEmailVerificationOtpController
);

router.post(
  '/verify-email',
  verifyEmailLimiter,
  verifyEmailController
);

router.post(
  '/admin/register',
  adminRegisterLimiter,
  registerAdminController
);


router.post(
  '/student/register',
  studentRegisterLimiter,
  studentFaceUpload.single('faceImage'),
  registerStudentController
);

router.post(
  '/student/login',
  studentLoginController
);

router.post(
  '/student/verify-mfa',
  verifyStudentMfaController
);

router.post(
  '/student/face-login',
  studentRegisterLimiter,
  studentFaceUpload.single('faceImage'),
  studentFaceLoginController
);

export default router;