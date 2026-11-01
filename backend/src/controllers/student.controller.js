import { registerStudent } from '../services/student.service.js';
import { extractFaceEmbedding } from '../services/ai-client.service.js';
import {
  startStudentLogin,
  completeStudentMfa,
  startStudentFaceLogin
} from '../services/student.service.js';
import { setAuthCookies } from '../utils/cookies.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerStudentController(req, res, next) {
  try {
    const { fullName, email, password } = req.body;

    if (
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and password are required.',
      });
    }

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2 || normalizedName.length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Full name must contain 2–150 characters.',
      });
    }

    if (
      normalizedEmail.length > 255 ||
      !EMAIL_REGEX.test(normalizedEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address.',
      });
    }

    if (
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 1024
    ) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 12 characters and no more than 1024 bytes.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'A face image is required.',
      });
    }

    // Generate the embedding before creating any database records.
    const faceEmbedding = await extractFaceEmbedding(req.file);

    const student = await registerStudent({
      fullName: normalizedName,
      email: normalizedEmail,
      password,
      faceEmbedding,
    });

    return res.status(201).json({
      success: true,
      message:
        'Student registered successfully. Verify your email before logging in.',
      data: {
        userId: student.userId,
        studentId: student.studentId,
        fullName: normalizedName,
        email: normalizedEmail,
        role: 'STUDENT',
        emailVerified: false,
      },
    });
  } catch (error) {
    next(error);
  }
}


export async function studentLoginController(req, res, next) {
  try {
    const email =
      typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const password =
      typeof req.body.password === 'string'
        ? req.body.password
        : '';

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !password ||
      Buffer.byteLength(password, 'utf8') > 1024
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid email and password are required.',
      });
    }

    const result = await startStudentLogin({ email, password });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
      return res.status(403).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    next(error);
  }
}

export async function verifyStudentMfaController(req, res, next) {
  try {
    const email =
      typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const otp =
      typeof req.body.otp === 'string'
        ? req.body.otp.trim()
        : '';

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: 'A valid email and six-digit OTP are required.',
      });
    }

    const result = await completeStudentMfa({ email, otp });

    setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Student login successful.',
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}


export async function studentFaceLoginController(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'A face image is required.',
      });
    }

    const result = await startStudentFaceLogin(req.file);

    return res.status(200).json({
      success: true,
      message: result.message,
      email: result.email,
    });
  } catch (error) {
    if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
      return res.status(403).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    next(error);
  }
}

