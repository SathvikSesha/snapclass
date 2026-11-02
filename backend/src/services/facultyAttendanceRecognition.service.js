
import * as attendanceRepository from '../repositories/facultyAttendance.repository.js';
import { env } from '../config/env.js';

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseEmbedding = (value) => {
  try {
    const embedding =
      typeof value === 'string' ? JSON.parse(value) : value;

    if (
      !Array.isArray(embedding) ||
      embedding.length !== 128 ||
      !embedding.every(
        (number) =>
          typeof number === 'number' && Number.isFinite(number)
      )
    ) {
      return null;
    }

    return embedding;
  } catch {
    return null;
  }
};

export const recognizeAttendanceFaces = async ({
  userId,
  subjectId,
  files,
}) => {
  const assignment =
    await attendanceRepository.getFacultySubjectAssignment(
      userId,
      subjectId
    );

  if (!assignment) {
    throw createError(
      'You are not assigned to teach this subject',
      403
    );
  }

  if (!files?.length || files.length > 4) {
    throw createError(
      'Upload between 1 and 4 classroom images',
      400
    );
  }

  const enrolledRows =
    await attendanceRepository.getEnrolledStudentsWithFaceEmbeddings(
      subjectId
    );

  if (!enrolledRows.length) {
    throw createError(
      'No students are enrolled in this subject',
      422
    );
  }

  const enrolledStudents = enrolledRows
    .filter(
      (student) => student.faceModelVersion === 'dlib-128-v1'
    )
    .map((student) => ({
      studentId: String(student.studentId),
      embedding: parseEmbedding(student.faceEmbedding),
    }))
    .filter((student) => student.embedding !== null);

  if (!enrolledStudents.length) {
    throw createError(
      'No compatible enrolled face embeddings are available',
      422
    );
  }

  const form = new FormData();

  for (const file of files) {
    form.append(
      'images',
      new Blob([file.buffer], { type: file.mimetype }),
      file.originalname
    );
  }

  form.append(
    'enrolled_students',
    JSON.stringify(enrolledStudents)
  );

  let response;

  try {
    response = await fetch(
      `${env.aiServiceUrl}/api/face/recognize`,
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60_000),
      }
    );
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw createError(
        'AI recognition timed out. Please try again.',
        504
      );
    }

    throw createError(
      'Could not connect to the AI recognition service',
      502
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw createError(
      'AI service returned an invalid response',
      502
    );
  }

  if (!response.ok || result.success !== true) {
    throw createError(
      'AI recognition failed. Please try again.',
      502
    );
  }

  // Defensively ensure AI results only reference students enrolled
  // in this subject. The AI response is not trusted for authorization.
  const enrolledIds = new Set(
    enrolledStudents.map((student) => student.studentId)
  );

  const recognizedStudents = (
    Array.isArray(result.recognizedStudents)
      ? result.recognizedStudents
      : []
  ).filter((student) =>
    enrolledIds.has(String(student.studentId))
  );

  return {
    subjectId,
    imagesProcessed: result.imagesProcessed,
    totalFacesDetected: result.totalFacesDetected,
    recognizedCount: recognizedStudents.length,
    unknownFaces: result.unknownFaces,
    ambiguousFaces: result.ambiguousFaces,
    recognizedStudents: recognizedStudents.map((student) => ({
      studentId: String(student.studentId),
      distance: student.distance,
      suggestedStatus: 'PRESENT',
    })),
  };
};
