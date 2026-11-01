import { hashPassword } from '../utils/password.js';
import { createStudentRecords } from '../repositories/student.repository.js';
import { findUserForAuthentication } from '../repositories/user.repository.js';
import { generateAndSendOtp, verifyOtp } from './otp.service.js';
import { verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../utils/token.js';
import { createRefreshSession } from './session.service.js';
import { extractFaceEmbedding } from './ai-client.service.js';
import { pool } from '../config/db.js';

export async function registerStudent({
  fullName,
  email,
  password,
  faceEmbedding,
}) {
  const passwordHash = await hashPassword(password);

  try {
    return await createStudentRecords({
      fullName,
      email,
      passwordHash,
      faceEmbedding,
    });
  } catch (error) {
    if (error.code === 'DUPLICATE_FACE') {
      const conflict = new Error(
        'This face is already registered. Please log in with your existing account.'
      );
      conflict.statusCode = 409;
      throw conflict;
    }

    if (error.code === 'ER_DUP_ENTRY') {
      const conflict = new Error(
        'An account with this email already exists.'
      );
      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  }
}



export async function startStudentLogin({ email, password }) {
  const user = await findUserForAuthentication(email);

  const invalidCredentials = () => {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    return error;
  };

  if (!user || user.role !== 'STUDENT') {
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
    const error = new Error('Verify your email before logging in.');
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
    message: 'Login verification code sent to your email.',
  };
}

export async function completeStudentMfa({ email, otp }) {
  const user = await findUserForAuthentication(email);

  if (
    !user ||
    user.role !== 'STUDENT' ||
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


export async function startStudentFaceLogin(file) {
  // Extract the face embedding using the existing FastAPI service.
  const faceEmbedding = await extractFaceEmbedding(file);

  const [rows] = await pool.execute(
    `SELECT
       u.user_id,
       u.email,
       u.role,
       u.status,
       u.email_verified,
       b.face_embedding
     FROM student_biometrics b
     JOIN students s ON s.student_id = b.student_id
     JOIN users u ON u.user_id = s.user_id
     WHERE u.role = 'STUDENT'`
  );

  const FACE_MATCH_THRESHOLD = 0.5;

  let matchedUser = null;

  for (const row of rows) {
    const storedEmbedding =
      typeof row.face_embedding === 'string'
        ? JSON.parse(row.face_embedding)
        : row.face_embedding;

    if (
      !Array.isArray(storedEmbedding) ||
      storedEmbedding.length !== 128 ||
      !storedEmbedding.every(
        value => typeof value === 'number' && Number.isFinite(value)
      )
    ) {
      continue;
    }

    let squaredDistance = 0;

    for (let i = 0; i < 128; i++) {
      const difference = faceEmbedding[i] - storedEmbedding[i];
      squaredDistance += difference * difference;
    }

    const distance = Math.sqrt(squaredDistance);

    if (distance <= FACE_MATCH_THRESHOLD) {
      matchedUser = row;
      break;
    }
  }

  if (!matchedUser) {
    const error = new Error('Face not recognized. Please try another login method.');
    error.statusCode = 401;
    throw error;
  }

  if (matchedUser.status !== 'ACTIVE') {
    const error = new Error('This account is not active.');
    error.statusCode = 403;
    throw error;
  }

  if (!matchedUser.email_verified) {
    const error = new Error('Verify your email before logging in.');
    error.statusCode = 403;
    error.code = 'EMAIL_VERIFICATION_REQUIRED';
    throw error;
  }

  await generateAndSendOtp({
    userId: String(matchedUser.user_id),
    email: matchedUser.email,
    purpose: 'MFA',
  });

  return {
    email: matchedUser.email,
    message: 'Login verification code sent to your registered email.',
  };
}

