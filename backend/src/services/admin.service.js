import { getRegistrationWindow } from '../repositories/admin.repository.js';
import { createRegistrationWindow } from '../repositories/admin.repository.js';
import { updateRegistrationWindow } from '../repositories/admin.repository.js';

import { disablePortalUser } from '../repositories/admin.repository.js';
import { revokeAllUserSessions } from './session.service.js';
import { queueAccountRemovalEmail } from './email-queue.service.js';

import {
  getAllStudents,
  getStudentRegisteredSubjects,
  getAllFaculty,
  getFacultyAssignedSubjects,
} from '../repositories/admin.repository.js';

export const getRegistrationWindowDetails = async () => {
  const window = await getRegistrationWindow();

  if (!window) {
    return {
      status: 'NOT_SCHEDULED',
      registrationWindow: null,
    };
  }

  return {
    status: window.status,
    registrationWindow: window,
  };
};

const parseDateTime = (value) => {
  if (typeof value !== 'string') return null;

  // Accept MySQL-style local datetime: YYYY-MM-DD HH:mm:ss
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
  );

  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match.map(Number);

  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));

  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi ||
    date.getUTCSeconds() !== s
  ) {
    return null;
  }

  return date;
};

export const scheduleRegistrationWindow = async ({
  startsAt,
  endsAt,
  adminUserId,
}) => {
  const start = parseDateTime(startsAt);
  const end = parseDateTime(endsAt);

  if (!start || !end) {
    const error = new Error(
      'Dates must use YYYY-MM-DD HH:mm:ss format.'
    );
    error.statusCode = 400;
    throw error;
  }

  if (end <= start) {
    const error = new Error(
      'The end time must be after the start time.'
    );
    error.statusCode = 400;
    throw error;
  }

  // Do not allow creating a window that has already ended.
  if (end <= new Date()) {
    const error = new Error(
      'The registration window must end in the future.'
    );
    error.statusCode = 400;
    throw error;
  }

  return createRegistrationWindow({
    startsAt,
    endsAt,
    adminUserId,
  });
};



export const rescheduleRegistrationWindow = async ({
  windowId,
  startsAt,
  endsAt,
}) => {
  const id = Number(windowId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Invalid registration window ID.');
    error.statusCode = 400;
    throw error;
  }

  const start = parseDateTime(startsAt);
  const end = parseDateTime(endsAt);

  if (!start || !end) {
    const error = new Error(
      'Dates must use YYYY-MM-DD HH:mm:ss format.'
    );
    error.statusCode = 400;
    throw error;
  }

  if (end <= start) {
    const error = new Error(
      'The end time must be after the start time.'
    );
    error.statusCode = 400;
    throw error;
  }

  if (end <= new Date()) {
    const error = new Error(
      'The registration window must end in the future.'
    );
    error.statusCode = 400;
    throw error;
  }

  return updateRegistrationWindow({
    windowId: id,
    startsAt,
    endsAt,
  });
};

export const fetchAllStudents = async () => {
  return await getAllStudents();
};

export const fetchStudentSubjects = async (studentId) => {
  const student = await getStudentRegisteredSubjects(studentId);

  if (!student) {
    const error = new Error('Student not found.');
    error.statusCode = 404;
    throw error;
  }

  return student;
};

export const fetchAllFaculty = async () => {
  return await getAllFaculty();
};

export const fetchFacultySubjects = async (facultyId) => {
  const faculty = await getFacultyAssignedSubjects(facultyId);

  if (!faculty) {
    const error = new Error('Faculty member not found.');
    error.statusCode = 404;
    throw error;
  }

  return faculty;
};



export const removePortalUser = async ({ accountId, role }) => {
  if (!['STUDENT', 'FACULTY'].includes(role)) {
    const error = new Error('Invalid account role.');
    error.statusCode = 400;
    throw error;
  }

  const account = await disablePortalUser({ accountId, role });

  if (!account) {
    const error = new Error(`${role.toLowerCase()} account not found.`);
    error.statusCode = 404;
    throw error;
  }

  if (account.alreadyDisabled) {
    const error = new Error('This account is already disabled.');
    error.statusCode = 409;
    throw error;
  }

  // The database status is now DISABLED.
  // Attempt session revocation and email delivery independently.
  let sessionsRevoked = false;
  let emailQueued = false;

  try {
    await revokeAllUserSessions(account.userId);
    sessionsRevoked = true;
  } catch (error) {
    console.error('Session revocation failed:', error);
  }

  try {
    await queueAccountRemovalEmail({
      email: account.email,
      fullName: account.fullName,
      role: account.role,
    });

    emailQueued = true;
  } catch (error) {
    console.error('Account removal email queue failed:', error);
  }

  return {
    account: {
      accountId: account.accountId,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      status: 'DISABLED',
    },
    sessionsRevoked,
    emailQueued,
  };
};

