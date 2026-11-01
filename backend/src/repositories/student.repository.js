
import { pool } from '../config/db.js';

const FACE_MATCH_THRESHOLD = 0.5;
const FACE_REGISTRATION_LOCK = 'snapclass_student_face_registration';

function parseEmbedding(value) {
  const embedding =
    typeof value === 'string' ? JSON.parse(value) : value;

  if (
    !Array.isArray(embedding) ||
    embedding.length !== 128 ||
    !embedding.every(
      number => typeof number === 'number' && Number.isFinite(number)
    )
  ) {
    throw new Error('Invalid stored face embedding.');
  }

  return embedding;
}

function calculateEuclideanDistance(embeddingA, embeddingB) {
  let sum = 0;

  for (let i = 0; i < 128; i++) {
    const difference = embeddingA[i] - embeddingB[i];
    sum += difference * difference;
  }

  return Math.sqrt(sum);
}

async function findMatchingStudent(connection, newEmbedding) {
  const [rows] = await connection.execute(
    `SELECT student_id, face_embedding
     FROM student_biometrics`
  );

  for (const row of rows) {
    const existingEmbedding = parseEmbedding(row.face_embedding);

    const distance = calculateEuclideanDistance(
      newEmbedding,
      existingEmbedding
    );

    if (distance <= FACE_MATCH_THRESHOLD) {
      return {
        studentId: row.student_id,
        distance,
      };
    }
  }

  return null;
}

export async function createStudentRecords({
  email,
  passwordHash,
  fullName,
  faceEmbedding,
  voiceEmbedding = null,
}) {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;

  try {
    // Serialize student registrations so two requests cannot
    // both pass the face-duplicate check simultaneously.
    const [lockRows] = await connection.execute(
      'SELECT GET_LOCK(?, 10) AS acquired',
      [FACE_REGISTRATION_LOCK]
    );

    if (Number(lockRows[0].acquired) !== 1) {
      const error = new Error(
        'Registration is busy. Please try again.'
      );
      error.statusCode = 503;
      throw error;
    }

    lockAcquired = true;

    await connection.beginTransaction();
    transactionStarted = true;

    const match = await findMatchingStudent(
      connection,
      faceEmbedding
    );

    if (match) {
      const error = new Error(
        'This face is already registered. Please log in with your existing account.'
      );
      error.code = 'DUPLICATE_FACE';
      throw error;
    }

    const [userResult] = await connection.execute(
      `INSERT INTO users
        (email, password_hash, role, status, email_verified)
       VALUES (?, ?, 'STUDENT', 'ACTIVE', FALSE)`,
      [email, passwordHash]
    );

    const userId = userResult.insertId;

    const [studentResult] = await connection.execute(
      `INSERT INTO students (user_id, full_name)
       VALUES (?, ?)`,
      [userId, fullName]
    );

    const studentId = studentResult.insertId;

    await connection.execute(
      `INSERT INTO student_biometrics
        (student_id, face_embedding, voice_embedding, face_model_version)
       VALUES (?, ?, ?, ?)`,
      [
        studentId,
        JSON.stringify(faceEmbedding),
        voiceEmbedding ? JSON.stringify(voiceEmbedding) : null,
        'dlib-128-v1',
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return { userId, studentId };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Student registration rollback failed:', rollbackError);
      }
    }

    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute(
          'SELECT RELEASE_LOCK(?)',
          [FACE_REGISTRATION_LOCK]
        );
      } catch (lockError) {
        console.error('Could not release face registration lock:', lockError);
      }
    }

    connection.release();
  }
}
