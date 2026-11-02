
import * as attendanceRepository from '../repositories/facultyAttendance.repository.js';


export const getFacultyAttendanceDates = async ({ userId, subjectId }) => {
  const assignment =
    await attendanceRepository.getFacultySubjectAssignment(
      userId,
      subjectId
    );

  if (!assignment) {
    const error = new Error(
      'You are not assigned to teach this subject'
    );
    error.statusCode = 403;
    throw error;
  }

  const dates = await attendanceRepository.getAttendanceDates(subjectId);

  return {
    subjectId,
    totalSessions: dates.length,
    dates,
  };
};



export const getFacultyAttendanceStudents = async ({
  userId,
  subjectId,
  attendanceDate,
}) => {
  const assignment =
    await attendanceRepository.getFacultySubjectAssignment(
      userId,
      subjectId
    );

  if (!assignment) {
    const error = new Error(
      'You are not assigned to teach this subject'
    );
    error.statusCode = 403;
    throw error;
  }

  const students = await attendanceRepository.getAttendanceStudents(
    subjectId,
    attendanceDate
  );

  return {
    subjectId,
    attendanceDate,
    totalStudents: students.length,
    presentCount: students.filter(
      (student) => student.status === 'PRESENT'
    ).length,
    absentCount: students.filter(
      (student) => student.status === 'ABSENT'
    ).length,
    students,
  };
};


export const saveFacultyAttendance = async ({
  userId,
  subjectId,
  attendanceDate,
  students,
}) => {
  const assignment = await attendanceRepository.getFacultySubjectAssignment(
    userId,
    subjectId
  );

  if (!assignment) {
    const error = new Error(
      'You are not assigned to this subject.'
    );
    error.statusCode = 403;
    throw error;
  }

  if (
    typeof attendanceDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
  ) {
    const error = new Error(
      'Attendance date must use YYYY-MM-DD format.'
    );
    error.statusCode = 400;
    throw error;
  }

  const parsedDate = new Date(`${attendanceDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== attendanceDate
  ) {
    const error = new Error('Invalid attendance date.');
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(students) || students.length === 0) {
    const error = new Error(
      'Attendance must include the enrolled students.'
    );
    error.statusCode = 400;
    throw error;
  }

  const seenIds = new Set();

  const normalizedStudents = students.map((student) => {
    const studentId = student?.studentId;
    const status = student?.status;

    if (
      !Number.isSafeInteger(studentId) ||
      studentId <= 0
    ) {
      const error = new Error('Invalid student ID.');
      error.statusCode = 400;
      throw error;
    }

    if (!['PRESENT', 'ABSENT'].includes(status)) {
      const error = new Error(
        'Each student status must be PRESENT or ABSENT.'
      );
      error.statusCode = 400;
      throw error;
    }

    if (seenIds.has(studentId)) {
      const error = new Error(
        'Duplicate student IDs are not allowed.'
      );
      error.statusCode = 400;
      throw error;
    }

    seenIds.add(studentId);

    return { studentId, status };
  });

  return attendanceRepository.saveAttendanceSession({
    subjectId,
    attendanceDate,
    facultyId: assignment.facultyId,
    students: normalizedStudents,
  });
};