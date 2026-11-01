import { registerAdmin,startAdminLogin,completeAdminMfa,sendEmailVerificationOtp,verifyUserEmail } from '../services/auth.service.js';
import {setAuthCookies,setAccessCookie} from '../utils/cookies.js';
import { registerFaculty,startFacultyLogin,completeFacultyMfa } from '../services/auth.service.js';

export async function registerAdminController(req, res, next) {
  try {
    const { fullName, email, password } = req.body;

    if (typeof fullName !== 'string' ||typeof email !== 'string' ||typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required.',
      });
    }

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2 || normalizedName.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 255 || password.length < 8 || Buffer.byteLength(password, 'utf8') > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid registration details.',
      });
    }

    const admin = await registerAdmin({fullName: normalizedName,email: normalizedEmail,password});

    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully. Verify your email before logging in.',
      data: {
        userId: admin.user_id,
        adminId: admin.admin_id,
        fullName: admin.full_name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function sendEmailVerificationOtpController(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.',
      });
    }

    const result = await sendEmailVerificationOtp(email);

    return res.status(200).json({
      success: true,
      message: result.message,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailController(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

    if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.',
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be a six-digit string.',
      });
    }

    const result = await verifyUserEmail({ email, otp });

    return res.status(200).json({
      success: true,
      message: result.alreadyVerified ? 'Email is already verified.' : 'Email verified successfully.',
    });
  } catch (error) {
    next(error);
  }
}

export async function adminLoginController(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || Buffer.byteLength(password, 'utf8') > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Valid email and password are required.',
      });
    }

    const result = await startAdminLogin({ email, password });

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

export async function verifyAdminMfaController(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email and six-digit OTP are required.',
      });
    }

    const result = await completeAdminMfa({ email, otp });

    setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Admin login successful.',
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function registerFacultyController(req, res, next) {
  try {
    const { fullName, email, password } = req.body;

    if (typeof fullName !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required.',
      });
    }

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2 || normalizedName.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 255 || password.length < 8 || Buffer.byteLength(password, 'utf8') > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid registration details.',
      });
    }

    const faculty = await registerFaculty({
      fullName: normalizedName,
      email: normalizedEmail,
      password,
    });

    return res.status(201).json({
      success: true,
      message: 'Faculty account created. Verify your email before logging in.',
      data: {
        userId: faculty.user_id,
        facultyId: faculty.faculty_id,
        fullName: faculty.full_name,
        email: faculty.email,
        role: faculty.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function facultyLoginController(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || Buffer.byteLength(password, 'utf8') > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Valid email and password are required.',
      });
    }

    const result = await startFacultyLogin({ email, password });

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

export async function verifyFacultyMfaController(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email and six-digit OTP are required.',
      });
    }

    const result = await completeFacultyMfa({ email, otp });

    setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Faculty login successful.',
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}