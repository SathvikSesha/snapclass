import { pool } from '../config/db.js';
import * as facultySubjectsRepository from '../repositories/facultySubjects.repository.js';
import { createLog } from '../repositories/logs.repository.js';

export const getFacultySubjects = async (userId) => {
  const exists = await facultySubjectsRepository.facultyProfileExists(userId);

  if (!exists) {
    const error = new Error('Faculty profile not found');
    error.statusCode = 404;
    throw error;
  }

  const subjects = await facultySubjectsRepository.getAllSubjectsForFaculty(userId);

  return {
    totalSubjects: subjects.length,
    teachingCount: subjects.filter((subject) => subject.isTeaching).length,
    subjects,
  };
};

export const requestSubjectAccess = async ({ userId, subjectId }) => {
  const parsedSubjectId = Number(subjectId);

  if (!Number.isSafeInteger(parsedSubjectId) || parsedSubjectId <= 0) {
    const error = new Error('Invalid subject ID');
    error.statusCode = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const faculty = await facultySubjectsRepository.getFacultyByUserId(userId, connection);
    if (!faculty) {
      const error = new Error('Faculty profile not found');
      error.statusCode = 404;
      throw error;
    }

    const subject = await facultySubjectsRepository.getSubjectById(parsedSubjectId, connection);
    if (!subject) {
      const error = new Error('Subject not found');
      error.statusCode = 404;
      throw error;
    }

    const isTeaching = await facultySubjectsRepository.isFacultyTeachingSubject(
      faculty.faculty_id,
      parsedSubjectId,
      connection
    );
    if (isTeaching) {
      const error = new Error('You are already assigned to teach this subject');
      error.statusCode = 409;
      throw error;
    }

    const existingRequest = await facultySubjectsRepository.getExistingSubjectRequest(
      faculty.faculty_id,
      parsedSubjectId,
      connection
    );

    let requestId;

    if (existingRequest) {
      if (existingRequest.status === 'PENDING') {
        const error = new Error('A request for this subject is already pending admin review');
        error.statusCode = 409;
        throw error;
      }
      if (existingRequest.status === 'APPROVED') {
        const error = new Error('You have already been approved for this subject');
        error.statusCode = 409;
        throw error;
      }
      if (existingRequest.status === 'REJECTED') {
        // Reopen the rejected request back to PENDING
        requestId = existingRequest.id;
        await facultySubjectsRepository.reopenSubjectRequest(requestId, connection);
      }
    } else {
      requestId = await facultySubjectsRepository.createSubjectRequest(
        { subjectId: parsedSubjectId, facultyId: faculty.faculty_id },
        connection
      );
    }

    await createLog({
      actorUserId: userId,
      actorName: faculty.full_name,
      eventType: 'FACULTY_SUBJECT_REQUESTED',
      message: `Faculty ${faculty.full_name} requested to teach subject: ${subject.name} (${subject.subjectCode})`,
      entityType: 'SUBJECT_REQUEST',
      entityId: requestId,
      connection,
    });

    await connection.commit();
    transactionStarted = false;

    return {
      requestId,
      subjectId: parsedSubjectId,
      subjectName: subject.name,
      subjectCode: subject.subjectCode,
      status: 'PENDING',
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Failed to rollback transaction safely:', rollbackError);
      }
    }

    if (error.code === 'ER_DUP_ENTRY') {
      const dupError = new Error('A request for this subject already exists');
      dupError.statusCode = 409;
      throw dupError;
    }

    throw error;
  } finally {
    connection.release();
  }
};
