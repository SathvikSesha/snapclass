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
import { getStudentDashboardData } from '../repositories/student.repository.js';
import {
  getStudentSubjectCatalog,
  getStudentRegistrationWindow,
  registerStudentForSubject,
} from '../repositories/student.repository.js';

import {
  getStudentAttendanceSummary,
  getStudentAttendanceHistory,
} from '../repositories/student.repository.js';

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

export const getStudentDashboard = async (userId) => {
  const dashboard = await getStudentDashboardData(userId);

  if (!dashboard) {
    const error = new Error(
      'Student profile not found or account is not active.'
    );
    error.statusCode = 404;
    throw error;
  }

  return {
    profile: dashboard.student,

    summary: {
      registeredSubjects: dashboard.registeredSubjects,
      registeredCredits: null,
      creditLimit: 30,
      remainingCredits: null,
    },

    registration: {
      status: 'NOT_CONFIGURED',
      startsAt: null,
      endsAt: null,
    },

    recentActivity: dashboard.recentActivity,
  };
};


export const getStudentSubjects = async (userId) => {
  const subjects = await getStudentSubjectCatalog(userId);

  if (subjects === null) {
    const error = new Error('Active student profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const registeredSubjects = subjects.filter(
    (subject) => subject.isRegistered
  );

  const registeredCredits = registeredSubjects.reduce(
    (total, subject) => total + subject.credits,
    0
  );

  const window = await getStudentRegistrationWindow();

  return {
    totalSubjects: subjects.length,
    registeredSubjects: registeredSubjects.length,
    unregisteredSubjects: subjects.length - registeredSubjects.length,
    registeredCredits,
    creditLimit: 30,
    remainingCredits: Math.max(0, 30 - registeredCredits),
    registrationWindow: {
      status: window?.status ?? 'NOT_SCHEDULED',
      startsAt: window?.startsAt ?? null,
      endsAt: window?.endsAt ?? null,
    },
    subjects,
  };
};



export const registerForSubject = async (userId, subjectId) => {
  const id = Number(subjectId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Invalid subject ID.');
    error.statusCode = 400;
    throw error;
  }

  return registerStudentForSubject({
    userId,
    subjectId: id,
    creditLimit: 30,
  });
};



const validateAttendanceSubjectId = (subjectId) => {
  const id = Number(subjectId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Invalid subject ID.');
    error.statusCode = 400;
    throw error;
  }

  return id;
};

const handleAttendanceAccessError = (result) => {
  if (result.error === 'SUBJECT_NOT_FOUND') {
    const error = new Error('Subject not found.');
    error.statusCode = 404;
    throw error;
  }

  if (result.error === 'NOT_ENROLLED') {
    const error = new Error(
      'You are not registered for this subject.'
    );
    error.statusCode = 403;
    throw error;
  }

  return result;
};

export const getStudentAttendance = async (userId, subjectId) => {
  const id = validateAttendanceSubjectId(subjectId);

  const result = await getStudentAttendanceSummary({
    userId,
    subjectId: id,
  });

  return handleAttendanceAccessError(result);
};

export const getStudentAttendanceHistoryData = async (
  userId,
  subjectId
) => {
  const id = validateAttendanceSubjectId(subjectId);

  const result = await getStudentAttendanceHistory({
    userId,
    subjectId: id,
  });

  return handleAttendanceAccessError(result);
};
