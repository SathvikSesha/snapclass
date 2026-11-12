import { pool } from '../config/db.js';
import * as subjectsRepository from '../repositories/adminSubjects.repository.js';
import * as requestsRepository from '../repositories/subjectRequests.repository.js';
import { createLog } from '../repositories/logs.repository.js';

export const createSubject = async ({
  subjectCode,
  name,
  description,
  credits = 3,
  adminUserId,
  adminName,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const subjectId = await subjectsRepository.createSubject(
      { subjectCode, name, description, credits, adminUserId },
      connection
    );

    await createLog({
      actorUserId: adminUserId,
      actorName: adminName,
      eventType: 'SUBJECT_CREATED',
      message: `Created subject: ${name} (${subjectCode}) [Credits: ${credits}]`,
      entityType: 'SUBJECT',
      entityId: subjectId,
      connection,
    });

    await connection.commit();

    return { id: subjectId, subjectCode, name, description: description ?? null, credits: Number(credits) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const getSubjects = async () => {
  return subjectsRepository.getAllSubjects();
};

export const getRequests = async (status = 'PENDING') => {
  const normalizedStatus = String(status || 'PENDING').trim().toUpperCase();
  const allowedStatuses = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

  if (!allowedStatuses.includes(normalizedStatus)) {
    const error = new Error('Invalid request status');
    error.statusCode = 400;
    throw error;
  }

  return requestsRepository.getSubjectRequests(normalizedStatus);
};

export const reviewSubjectRequest = async ({
  requestId,
  decision,
  adminUserId,
  adminName,
  reviewNote,
}) => {
  const normalizedDecision = String(decision).trim().toUpperCase();

  if (!['APPROVED', 'REJECTED'].includes(normalizedDecision)) {
    const error = new Error('Decision must be APPROVED or REJECTED');
    error.statusCode = 400;
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const request = await requestsRepository.getRequestForUpdate(
      requestId,
      connection
    );

    if (!request) {
      const error = new Error('Subject request not found');
      error.statusCode = 404;
      throw error;
    }

    if (request.status === normalizedDecision) {
      const error = new Error(`This request is already ${normalizedDecision.toLowerCase()}`);
      error.statusCode = 409;
      throw error;
    }

    if (normalizedDecision === 'APPROVED') {
      await requestsRepository.approveFacultyAssignment(
        request.subject_id,
        request.faculty_id,
        connection
      );
    } else if (normalizedDecision === 'REJECTED') {
      await requestsRepository.revokeFacultyAssignment(
        request.subject_id,
        request.faculty_id,
        connection
      );
    }

    const affectedRows = await requestsRepository.reviewRequest(
      {
        requestId,
        status: normalizedDecision,
        adminUserId,
        reviewNote,
      },
      connection
    );

    if (affectedRows !== 1) {
      const error = new Error('Request could not be updated');
      error.statusCode = 409;
      throw error;
    }

    await createLog({
      actorUserId: adminUserId,
      actorName: adminName,
      eventType: normalizedDecision === 'APPROVED'
        ? 'FACULTY_SUBJECT_APPROVED'
        : 'FACULTY_SUBJECT_REJECTED',
      message: `${normalizedDecision === 'APPROVED' ? 'Approved' : 'Rejected'} faculty request #${requestId}`,
      entityType: 'SUBJECT_REQUEST',
      entityId: requestId,
      connection,
    });

    await connection.commit();

    return { requestId: Number(requestId), status: normalizedDecision };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
