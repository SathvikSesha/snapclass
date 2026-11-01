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