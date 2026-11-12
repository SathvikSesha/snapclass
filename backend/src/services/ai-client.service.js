const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

export async function extractFaceEmbedding(file) {
  const formData = new FormData();

  formData.append(
    'image',
    new Blob([file.buffer], { type: file.mimetype }),
    file.originalname
  );

  let response;

  try {
    response = await fetch(
      `${AI_SERVICE_URL}/api/face/embedding`,
      {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(15000),
      }
    );
  } catch {
    const error = new Error('Face recognition service is unavailable.');
    error.statusCode = 503;
    throw error;
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      typeof result?.detail === 'string'
        ? result.detail
        : 'Could not process the face image.'
    );

    error.statusCode =
      response.status === 400 || response.status === 413 ||
      response.status === 415 || response.status === 422
        ? response.status
        : 502;

    throw error;
  }

  if (
    result?.success !== true ||
    result?.dimensions !== 128 ||
    !Array.isArray(result?.embedding) ||
    result.embedding.length !== 128 ||
    !result.embedding.every(
      value => typeof value === 'number' && Number.isFinite(value)
    )
  ) {
    const error = new Error('AI service returned an invalid face embedding.');
    error.statusCode = 502;
    throw error;
  }

  return result.embedding;
}


import { env } from '../config/env.js';

export async function ingestMaterial({
  buffer,
  filename,
  fileType,
  subjectId,
  documentId,
}) {
  const formData = new FormData();

  formData.append('subject_id', String(subjectId));
  formData.append('document_id', String(documentId));

  formData.append(
    'file',
    new Blob([buffer], { type: fileType }),
    filename
  );

  const headers = {};

  if (env.aiServiceApiKey) {
    headers['X-API-Key'] = env.aiServiceApiKey;
  }

  let response;

  try {
    response = await fetch(`${AI_SERVICE_URL}/api/rag/ingest`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    const serviceError = new Error(
      'AI ingestion service is unavailable or timed out.'
    );
    serviceError.statusCode = 503;
    throw serviceError;
  }

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success !== true) {
    const error = new Error(
      typeof result?.detail === 'string'
        ? result.detail
        : 'AI material ingestion failed.'
    );

    error.statusCode = response.status >= 400 &&
      response.status < 500
      ? response.status
      : 502;

    throw error;
  }

  return result.data;
}


export async function generateQuiz({
    subjectCode,
    documentIds,
    numberOfQuestions,
    difficulty,
}) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 180000);

    try {
        const response = await fetch(
            `${AI_SERVICE_URL}/api/rag/quiz`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.AI_SERVICE_API_KEY && {
                        'X-API-Key': process.env.AI_SERVICE_API_KEY,
                    }),
                },
                body: JSON.stringify({
                    subject_id: subjectCode,
                    document_ids: documentIds.map(String),
                    number_of_questions: numberOfQuestions,
                    difficulty,
                }),
                signal: controller.signal,
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(
                data.detail || data.message || 'AI quiz generation failed'
            );

            error.statusCode = response.status === 401 ? 502 : 503;
            throw error;
        }

        if (!data.success || !data.quiz?.questions?.length) {
            const error = new Error(
                'AI service returned an invalid quiz response'
            );

            error.statusCode = 502;
            throw error;
        }

        return data.quiz;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error(
                'AI quiz generation timed out. Please try again.'
            );
            timeoutError.statusCode = 504;
            throw timeoutError;
        }

        if (error.statusCode) {
            throw error;
        }

        const serviceError = new Error(
            'Unable to communicate with the AI service'
        );
        serviceError.statusCode = 503;
        throw serviceError;
    } finally {
        clearTimeout(timeout);
    }
}