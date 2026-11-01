import { pool } from '../config/db.js';
import { findUserByEmail, markEmailVerified } from '../repositories/user.repository.js';
import { generateAndSendOtp, verifyOtp } from './otp.service.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../utils/token.js';
import { setAuthCookies } from '../utils/cookies.js';
import { createRefreshSession } from './session.service.js';
import { findUserForAuthentication } from '../repositories/user.repository.js';


export async function registerAdmin({ fullName, email, password }) {
  const connection = await pool.getConnection();

  try {
    const passwordHash = await hashPassword(password);

    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      `INSERT INTO users
        (email, password_hash, role, status, email_verified)
       VALUES (?, ?, 'ADMIN', 'ACTIVE', FALSE)`,
      [email, passwordHash]
    );

    const userId = userResult.insertId;

    const [adminResult] = await connection.execute(
      `INSERT INTO admins (user_id, full_name)
       VALUES (?, ?)`,
      [userId, fullName]
    );

    await connection.commit();

    return {
      user_id: userId,
      admin_id: adminResult.insertId,
      email,
      full_name: fullName,
      role: 'ADMIN',
    };
  } catch (error) {
    await connection.rollback();

    // Handle duplicate email using the users.email UNIQUE constraint.
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicateError = new Error(
        'An account with this email already exists.'
      );
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  } finally {
    connection.release();
  }
}

export async function sendEmailVerificationOtp(email) {
  const user = await findUserByEmail(email);

  if (!user) {
    const error = new Error('User account not found.');
    error.statusCode = 404;
    throw error;
  }

  if (user.email_verified) {
    const error = new Error('Email is already verified.');
    error.statusCode = 409;
    throw error;
  }

  return generateAndSendOtp({
    userId: String(user.user_id),
    email: user.email,
    purpose: 'EMAIL_VERIFICATION',
  });
}

export async function verifyUserEmail({ email, otp }) {
  const user = await findUserByEmail(email);

  if (!user) {
    const error = new Error('User account not found.');
    error.statusCode = 404;
    throw error;
  }

  if (user.email_verified) {
    return { alreadyVerified: true };
  }

  const isValid = await verifyOtp({
    userId: String(user.user_id),
    purpose: 'EMAIL_VERIFICATION',
    otp,
  });

  if (!isValid) {
    const error = new Error('Invalid or expired OTP.');
    error.statusCode = 400;
    throw error;
  }

  const updatedRows = await markEmailVerified(user.user_id);

  if (updatedRows === 0) {
    const error = new Error('Could not update email verification status.');
    error.statusCode = 500;
    throw error;
  }

  return { alreadyVerified: false };
}


export async function startAdminLogin({ email, password }) {
  const user = await findUserForAuthentication(email);

  // Use a generic error to avoid revealing whether an account exists.
  const invalidCredentials = () => {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    return error;
  };

  if (!user || user.role !== 'ADMIN') {
    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(
    user.password_hash,
    password
  );

  if (!passwordMatches) {
    throw invalidCredentials();
  }

  if (user.status !== 'ACTIVE') {
    const error = new Error('This account is not active.');
    error.statusCode = 403;
    throw error;
  }

  if (!user.email_verified) {
    await generateAndSendOtp({
      userId: String(user.user_id),
      email: user.email,
      purpose: 'EMAIL_VERIFICATION',
    });

    const error = new Error(
      'Email verification is required. A verification code has been sent.'
    );
    error.statusCode = 403;
    error.code = 'EMAIL_VERIFICATION_REQUIRED';
    throw error;
  }

  await generateAndSendOtp({
    userId: String(user.user_id),
    email: user.email,
    purpose: 'MFA',
  });

  return {
    message: 'MFA verification code sent to your email.',
  };
}

export async function completeAdminMfa({ email, otp }, res) {
  const user = await findUserByEmail(email);

  if (
    !user ||
    user.role !== 'ADMIN' ||
    user.status !== 'ACTIVE' ||
    !user.email_verified
  ) {
    const error = new Error('Invalid or expired verification code.');
    error.statusCode = 400;
    throw error;
  }

  const valid = await verifyOtp({
    userId: String(user.user_id),
    purpose: 'MFA',
    otp,
  });

  if (!valid) {
    const error = new Error('Invalid or expired verification code.');
    error.statusCode = 400;
    throw error;
  }

  const refreshToken = generateRefreshToken();

  // Create the Redis session before issuing cookies.
  await createRefreshSession({
    userId: user.user_id,
    role: user.role,
    refreshToken,
  });

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    refreshToken,
    user: {
      userId: String(user.user_id),
      email: user.email,
      role: user.role,
    },
  };
}


export async function registerFaculty({ fullName, email, password }) {
  const connection = await pool.getConnection();

  try {
    const passwordHash = await hashPassword(password);

    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      `INSERT INTO users
         (email, password_hash, role, status, email_verified)
       VALUES (?, ?, 'FACULTY', 'ACTIVE', FALSE)`,
      [email, passwordHash]
    );

    const userId = userResult.insertId;

    const [facultyResult] = await connection.execute(
      `INSERT INTO faculty (user_id, full_name)
       VALUES (?, ?)`,
      [userId, fullName]
    );

    await connection.commit();

    return {
      user_id: userId,
      faculty_id: facultyResult.insertId,
      full_name: fullName,
      email,
      role: 'FACULTY',
    };
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      const conflict = new Error('An account with this email already exists.');
      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  } finally {
    connection.release();
  }
}

export async function startFacultyLogin({ email, password }) {
  const user = await findUserForAuthentication(email);

  const invalidCredentials = () => {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    return error;
  };

  if (!user || user.role !== 'FACULTY') {
    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(
    user.password_hash,
    password
  );

  if (!passwordMatches) {
    throw invalidCredentials();
  }

  if (user.status !== 'ACTIVE') {
    const error = new Error('This account is not active.');
    error.statusCode = 403;
    throw error;
  }

  if (!user.email_verified) {
    const error = new Error(
      'Verify your email before logging in.'
    );
    error.statusCode = 403;
    error.code = 'EMAIL_VERIFICATION_REQUIRED';
    throw error;
  }

  await generateAndSendOtp({
    userId: String(user.user_id),
    email: user.email,
    purpose: 'MFA',
  });

  return {
    message: 'MFA verification code sent to your email.',
  };
}

export async function completeFacultyMfa({ email, otp }) {
  const user = await findUserForAuthentication(email);

  if (!user || user.role !== 'FACULTY' || user.status !== 'ACTIVE' || !user.email_verified) {
    const error = new Error('Invalid or expired verification code.');
    error.statusCode = 400;
    throw error;
  }

  const valid = await verifyOtp({
    userId: String(user.user_id),
    purpose: 'MFA',
    otp,
  });

  if (!valid) {
    const error = new Error('Invalid or expired verification code.');
    error.statusCode = 400;
    throw error;
  }

  const refreshToken = generateRefreshToken();

  await createRefreshSession({
    userId: user.user_id,
    role: user.role,
    refreshToken,
  });

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    refreshToken,
    user: {
      userId: String(user.user_id),
      email: user.email,
      role: user.role,
    },
  };
}
